const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

// In-memory extraction cache to eliminate redundant yt-dlp & network calls during traffic spikes
const extractionCache = new Map();
const EXTRACTION_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const TWITTER_HOSTS = new Set(['twitter.com', 'x.com', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com']);

function isTwitterHost(hostname) {
  const clean = (hostname || '').replace(/^(www\.|mobile\.)/, '').toLowerCase();
  return TWITTER_HOSTS.has(clean);
}

function normalizeCacheKey(inputUrl) {
  try {
    let clean = inputUrl.trim();
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith('/')) {
      clean = 'https://' + clean;
    }
    const u = new URL(clean);
    let host = u.hostname.replace(/^(www\.|mobile\.)/, '').toLowerCase();
    if (TWITTER_HOSTS.has(host)) {
      host = 'twitter.com';
      // Strip tracking query params on Twitter status URLs
      return `${u.protocol}//${host}${u.pathname}`;
    }
    // Keep query params for non-Twitter URLs (e.g., Discord CDN signatures, GIPHY/Tenor/API params)
    return `${u.protocol}//${host}${u.pathname}${u.search}`;
  } catch (e) {
    return inputUrl.trim();
  }
}

// Sweep expired extraction cache entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of extractionCache.entries()) {
    if (now - item.timestamp > EXTRACTION_CACHE_TTL_MS) {
      extractionCache.delete(key);
    }
  }
}, 15 * 60 * 1000);

/**
 * Executes yt-dlp to inspect and extract video/GIF information from 1000+ supported sites
 */
function extractWithYtDlp(url) {
  return new Promise((resolve, reject) => {
    const python = process.platform === 'win32' ? 'python' : (process.env.PYTHON_BIN || 'python3');
    const args = ['-m', 'yt_dlp', '--dump-json', '--no-warnings', '--no-check-certificates', '--no-playlist', url];

    let stdout = '';
    let stderr = '';
    let settled = false;

    const proc = spawn(python, args);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (e) {}
        reject(new Error('yt-dlp extraction timed out'));
      }
    }, 15000);

    proc.stdout.on('data', chunk => stdout += chunk);
    proc.stderr.on('data', chunk => stderr += chunk);

    proc.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code === 0 && stdout.trim()) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const info = JSON.parse(trimmed);
              if (info && (info.url || info.formats)) {
                return resolve(info);
              }
            } catch (e) {}
          }
        }

        try {
          const info = JSON.parse(stdout.trim());
          return resolve(info);
        } catch (e) {
          return reject(new Error('Failed to parse yt-dlp JSON: ' + e.message));
        }
      } else {
        reject(new Error(stderr.trim() || 'yt-dlp exited with code ' + code));
      }
    });

    proc.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Picks the best direct MP4 or GIF stream from yt-dlp info object
 */
function pickBestYtDlpFormat(info) {
  let videoUrl = info.url;
  let mediaType = (info.ext === 'gif' || (videoUrl && /\.gif(\?|$)/i.test(videoUrl))) ? 'gif' : 'video';

  if (info.formats && info.formats.length > 0) {
    // 1. Direct progressive MP4 streams with video
    const directMp4s = info.formats.filter(f =>
      f.ext === 'mp4' &&
      f.vcodec !== 'none' &&
      f.url &&
      !f.url.includes('.m3u8') &&
      (!f.protocol || f.protocol === 'http' || f.protocol === 'https')
    );

    if (directMp4s.length > 0) {
      const sorted = directMp4s.sort((a, b) => {
        const resA = Math.abs((a.height || 480) - 512);
        const resB = Math.abs((b.height || 480) - 512);
        return resA - resB;
      });
      videoUrl = sorted[0].url;
      mediaType = 'video';
    } else {
      // 2. Direct GIF or WebM or other MP4 format
      const directMedia = info.formats.filter(f =>
        (f.ext === 'gif' || f.ext === 'mp4' || f.ext === 'webm') &&
        f.vcodec !== 'none' &&
        f.url &&
        !f.url.includes('.m3u8')
      );
      if (directMedia.length > 0) {
        const chosen = directMedia[directMedia.length - 1];
        videoUrl = chosen.url;
        mediaType = chosen.ext === 'gif' ? 'gif' : 'video';
      } else {
        const anyWithUrl = info.formats.filter(f => f.url && f.vcodec !== 'none');
        if (anyWithUrl.length > 0) {
          videoUrl = anyWithUrl[anyWithUrl.length - 1].url;
        }
      }
    }
  }

  return { videoUrl, mediaType };
}

/**
 * Fallback to FxTwitter API
 */
function extractWithFxTwitter(tweetUrl) {
  return new Promise((resolve, reject) => {
    const statusMatch = tweetUrl.match(/status\/(\d+)/);
    if (!statusMatch) return reject(new Error('No tweet status ID found'));
    const id = statusMatch[1];

    const apiUrl = `https://api.fxtwitter.com/i/status/${id}`;
    https.get(apiUrl, { headers: { 'User-Agent': 'WhatsAppStickerBot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.tweet && json.tweet.media) {
            const media = json.tweet.media;
            const videos = media.videos || [];
            if (videos.length > 0) {
              return resolve({
                title: json.tweet.text || 'Twitter GIF',
                uploader: json.tweet.author ? `@${json.tweet.author.screen_name}` : 'Twitter User',
                url: videos[0].url,
                thumbnail: videos[0].thumbnail_url || json.tweet.author?.avatar_url,
                duration: videos[0].duration || 0,
                mediaType: 'video'
              });
            }
            const photos = media.photos || [];
            if (photos.length > 0 && photos[0].url) {
              return resolve({
                title: json.tweet.text || 'Twitter Image',
                uploader: json.tweet.author ? `@${json.tweet.author.screen_name}` : 'Twitter User',
                url: photos[0].url,
                thumbnail: photos[0].url,
                duration: null,
                mediaType: 'gif'
              });
            }
          }
          reject(new Error('No media in FxTwitter response'));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fallback to VxTwitter API
 */
function extractWithVxTwitter(statusId) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://api.vxtwitter.com/Twitter/status/${statusId}`;
    https.get(apiUrl, { headers: { 'User-Agent': 'TwitSticker/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.media_extended && json.media_extended.length > 0) {
            const vid = json.media_extended.find(m => m.type === 'video' || m.type === 'gif') || json.media_extended[0];
            if (vid && vid.url) {
              return resolve({
                title: json.text || 'Twitter Media',
                uploader: json.user_screen_name ? `@${json.user_screen_name}` : (json.user_name || 'Twitter User'),
                url: vid.url,
                thumbnail: vid.thumbnail_url || null,
                duration: vid.duration_millis ? vid.duration_millis / 1000 : 3.0,
                mediaType: (vid.type === 'image' || /\.gif(\?|$)/i.test(vid.url)) ? 'gif' : 'video'
              });
            }
          }
          reject(new Error('No media in VxTwitter response'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Probes a URL by following redirects and inspecting Content-Type.
 * If Content-Type is image/* or video/*, aborts download immediately and returns direct media info.
 * If Content-Type is text/html, reads up to maxHtmlBytes of HTML for OpenGraph/meta extraction.
 */
function probeUrlAndFetchHtml(initialUrl, maxRedirects = 6, maxHtmlBytes = 300 * 1024) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;

    function step(urlStr) {
      if (redirectCount >= maxRedirects) {
        return resolve({ finalUrl: urlStr, contentType: '', html: '' });
      }

      let parsed;
      try {
        parsed = new URL(urlStr);
      } catch (e) {
        return reject(new Error('Invalid URL format'));
      }

      const client = parsed.protocol === 'https:' ? https : http;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/gif,video/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      };

      const req = client.get(urlStr, { headers }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          redirectCount++;
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            nextUrl = new URL(nextUrl, urlStr).toString();
          }
          return step(nextUrl);
        }

        const contentType = (res.headers['content-type'] || '').toLowerCase();

        // Direct image / GIF / video stream detected via Content-Type!
        if (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType === 'application/octet-stream') {
          res.destroy();
          return resolve({
            finalUrl: urlStr,
            contentType,
            statusCode: res.statusCode,
            html: ''
          });
        }

        // If HTML or JSON/text, read up to maxHtmlBytes
        let chunks = [];
        let totalBytes = 0;
        let finished = false;

        res.on('data', chunk => {
          if (finished) return;
          chunks.push(chunk);
          totalBytes += chunk.length;
          if (totalBytes >= maxHtmlBytes) {
            finished = true;
            res.destroy();
            resolve({
              finalUrl: urlStr,
              contentType,
              statusCode: res.statusCode,
              html: Buffer.concat(chunks).toString('utf8')
            });
          }
        });

        res.on('end', () => {
          if (finished) return;
          finished = true;
          resolve({
            finalUrl: urlStr,
            contentType,
            statusCode: res.statusCode,
            html: Buffer.concat(chunks).toString('utf8')
          });
        });

        res.on('error', () => {
          if (finished) return;
          finished = true;
          resolve({
            finalUrl: urlStr,
            contentType,
            statusCode: res.statusCode,
            html: Buffer.concat(chunks).toString('utf8')
          });
        });
      });

      req.on('error', err => reject(err));
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('Request timed out while probing URL'));
      });
    }

    step(initialUrl);
  });
}

/**
 * Helper to decode basic HTML entities in scraped attributes
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Extracts GIPHY direct GIF URL from any GIPHY page, embed, or CDN URL
 */
function tryResolveGiphyUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (!host.includes('giphy.com')) return null;

    // 1. Direct media path: /media/(v1.../)?<ID>/...
    const mediaMatch = u.pathname.match(/\/media\/(?:v1\.[^/]+\/)?([a-zA-Z0-9]{8,25})(?:\/|$)/);
    if (mediaMatch) {
      const id = mediaMatch[1];
      return {
        success: true,
        source: 'giphy',
        mediaType: 'gif',
        videoUrl: `https://i.giphy.com/media/${id}/giphy.gif`,
        title: 'GIPHY Animated GIF',
        author: 'GIPHY',
        duration: null,
        thumbnail: `https://i.giphy.com/media/${id}/200_s.gif`
      };
    }

    // 2. Share URLs: /gifs/<slug>-<ID> or /gifs/<ID> or /stickers/<slug>-<ID> or /embed/<ID>
    const pageMatch = u.pathname.match(/\/(?:gifs|stickers|embed)\/(?:.*-)?([a-zA-Z0-9]{8,25})(?:\/.*)?$/);
    if (pageMatch) {
      const id = pageMatch[1];
      const slugPart = u.pathname.split('/')[2] || '';
      const cleanTitle = slugPart.replace(/-[a-zA-Z0-9]{8,25}$/, '').replace(/-/g, ' ').trim();
      return {
        success: true,
        source: 'giphy',
        mediaType: 'gif',
        videoUrl: `https://i.giphy.com/media/${id}/giphy.gif`,
        title: cleanTitle ? `GIPHY: ${cleanTitle}` : 'GIPHY Animated GIF',
        author: 'GIPHY',
        duration: null,
        thumbnail: `https://i.giphy.com/media/${id}/200_s.gif`
      };
    }

    // 3. Direct i.giphy.com/<ID>.(gif|webp|mp4)
    const directIdMatch = u.pathname.match(/^\/([a-zA-Z0-9]{8,25})\.(gif|webp|mp4)$/i);
    if (directIdMatch) {
      const id = directIdMatch[1];
      return {
        success: true,
        source: 'giphy',
        mediaType: 'gif',
        videoUrl: `https://i.giphy.com/media/${id}/giphy.gif`,
        title: 'GIPHY Animated GIF',
        author: 'GIPHY',
        duration: null,
        thumbnail: null
      };
    }
  } catch (e) {}
  return null;
}

/**
 * Extracts media URL from HTML OpenGraph / Twitter Card / video / img tags
 */
function extractMediaFromHtml(html, baseUrl) {
  if (!html) return null;

  let host = 'Web Source';
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, '');
  } catch (e) {}

  // Extract page title
  let pageTitle = 'Animated GIF / Video';
  const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i)
    || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    pageTitle = decodeHtmlEntities(ogTitleMatch[1].trim()).slice(0, 90);
  }

  // Helper to resolve relative URLs
  function toAbs(candidate) {
    if (!candidate) return null;
    const decoded = decodeHtmlEntities(candidate.trim());
    try {
      return new URL(decoded, baseUrl).toString();
    } catch (e) {
      return null;
    }
  }

  // Collect all <meta> tag key-values
  const metaTags = [];
  const metaRegex = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(html)) !== null) {
    const tag = m[0];
    const propMatch = tag.match(/(?:property|name|itemprop)=["']([^"']+)["']/i);
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    if (propMatch && contentMatch) {
      metaTags.push({
        key: propMatch[1].toLowerCase(),
        val: toAbs(contentMatch[1])
      });
    }
  }

  // 1. Tenor specific direct GIF / MP4 extraction
  if (host.includes('tenor.com')) {
    const tenorGifMeta = metaTags.find(t => (t.key === 'og:image' || t.key === 'twitter:image') && t.val && /\.gif(\?|$)/i.test(t.val));
    if (tenorGifMeta) {
      return {
        success: true,
        source: 'tenor',
        mediaType: 'gif',
        videoUrl: tenorGifMeta.val,
        title: pageTitle || 'Tenor GIF',
        author: 'Tenor',
        duration: null,
        thumbnail: tenorGifMeta.val
      };
    }
    const tenorCdnMatch = html.match(/https:\/\/(?:media1?|c)\.tenor\.com\/[^"'\s<>]+\.gif/i);
    if (tenorCdnMatch) {
      return {
        success: true,
        source: 'tenor',
        mediaType: 'gif',
        videoUrl: decodeHtmlEntities(tenorCdnMatch[0]),
        title: pageTitle || 'Tenor GIF',
        author: 'Tenor',
        duration: null,
        thumbnail: decodeHtmlEntities(tenorCdnMatch[0])
      };
    }
  }

  // 2. GIPHY fallback in HTML
  if (host.includes('giphy.com')) {
    const giphyMeta = metaTags.find(t => (t.key === 'og:image' || t.key === 'og:url') && t.val && t.val.includes('giphy.com'));
    if (giphyMeta) {
      const resolved = tryResolveGiphyUrl(giphyMeta.val);
      if (resolved) return { ...resolved, title: pageTitle || resolved.title };
    }
  }

  // 3. Look for direct .gif in og:image / twitter:image / og:video
  const gifMeta = metaTags.find(t =>
    ['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src', 'og:video', 'og:video:secure_url', 'og:video:url'].includes(t.key) &&
    t.val &&
    /\.(gif)(\?.*)?$/i.test(t.val)
  );
  if (gifMeta) {
    return {
      success: true,
      source: host,
      mediaType: 'gif',
      videoUrl: gifMeta.val,
      title: pageTitle,
      author: host,
      duration: null,
      thumbnail: gifMeta.val
    };
  }

  // 4. Look for direct video (.mp4 / .webm / .mov) in og:video or twitter:player:stream
  const videoMeta = metaTags.find(t =>
    ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream', 'contenturl'].includes(t.key) &&
    t.val &&
    (/\.(mp4|webm|mov)(\?.*)?$/i.test(t.val) || (!t.val.includes('/embed/') && !t.val.includes('.html') && !t.val.endsWith('/')))
  );
  if (videoMeta && /\.(mp4|webm|mov)(\?.*)?$/i.test(videoMeta.val)) {
    const thumbMeta = metaTags.find(t => ['og:image', 'twitter:image'].includes(t.key) && t.val);
    return {
      success: true,
      source: host,
      mediaType: 'video',
      videoUrl: videoMeta.val,
      title: pageTitle,
      author: host,
      duration: null,
      thumbnail: thumbMeta ? thumbMeta.val : null
    };
  }

  // 5. Look for JSON-LD contentUrl or HTML5 <video>/<source> pointing to .gif or .mp4
  const jsonLdMatch = html.match(/"contentUrl"\s*:\s*"(https?:[^"]+\.(?:gif|mp4|webm|webp)(?:\?[^"]*)?)"/i);
  if (jsonLdMatch && jsonLdMatch[1]) {
    const mediaUrl = decodeHtmlEntities(jsonLdMatch[1].replace(/\\\//g, '/'));
    const isGif = /\.(gif|webp)(\?|$)/i.test(mediaUrl);
    return {
      success: true,
      source: host,
      mediaType: isGif ? 'gif' : 'video',
      videoUrl: mediaUrl,
      title: pageTitle,
      author: host,
      duration: null,
      thumbnail: isGif ? mediaUrl : null
    };
  }

  const videoTagMatch = html.match(/<(?:video|source)[^>]+src=["'](https?:[^"']+\.(?:mp4|webm|mov)(?:\?[^"']*)?)["']/i);
  if (videoTagMatch && videoTagMatch[1]) {
    const mediaUrl = toAbs(videoTagMatch[1]);
    if (mediaUrl) {
      return {
        success: true,
        source: host,
        mediaType: 'video',
        videoUrl: mediaUrl,
        title: pageTitle,
        author: host,
        duration: null,
        thumbnail: null
      };
    }
  }

  // 6. Look for prominent .gif in <img> tags or page body
  const imgGifMatch = html.match(/<img[^>]+src=["'](https?:[^"']+\.gif(?:\?[^"']*)?)["']/i);
  if (imgGifMatch && imgGifMatch[1]) {
    const mediaUrl = toAbs(imgGifMatch[1]);
    if (mediaUrl && !/pixel|tracker|spacer|1x1|favicon|icon/i.test(mediaUrl)) {
      return {
        success: true,
        source: host,
        mediaType: 'gif',
        videoUrl: mediaUrl,
        title: pageTitle,
        author: host,
        duration: null,
        thumbnail: mediaUrl
      };
    }
  }

  // 7. Keep non-GIF og:image (e.g. .webp / .png / .jpg) as fallback candidate
  const fallbackImageMeta = metaTags.find(t =>
    ['og:image', 'og:image:secure_url', 'twitter:image'].includes(t.key) &&
    t.val &&
    !/logo|favicon|avatar|default|site-icon/i.test(t.val)
  );
  if (fallbackImageMeta) {
    return {
      success: true,
      source: host,
      mediaType: 'gif',
      videoUrl: fallbackImageMeta.val,
      title: pageTitle,
      author: host,
      duration: null,
      thumbnail: fallbackImageMeta.val,
      isFallbackImage: true
    };
  }

  return null;
}

/**
 * Main universal resolution function — supports ANY GIF link, video URL, or social post
 */
async function resolveMedia(inputUrl) {
  let url = (inputUrl || '').trim();
  if (!url) {
    throw new Error('Please provide a valid GIF or video URL');
  }

  // Local sample paths (e.g., /samples/sample-earth.gif)
  if (url.startsWith('/') && !url.startsWith('//')) {
    const isGif = /\.(gif|webp|png|jpe?g)$/i.test(url);
    return {
      success: true,
      source: 'local',
      mediaType: isGif ? 'gif' : 'video',
      videoUrl: url,
      title: 'Sample Media',
      author: 'TwitSticker',
      duration: null,
      thumbnail: null
    };
  }

  // If protocol missing, add https://
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // 0. Check Extraction Cache
  const normKey = normalizeCacheKey(url);
  const cached = extractionCache.get(normKey);
  if (cached && (Date.now() - cached.timestamp < EXTRACTION_CACHE_TTL_MS)) {
    console.log(`[EXTRACTION CACHE HIT] Serving cached media for ${normKey}`);
    return { ...cached.data, cached: true };
  }

  function cacheAndReturn(result) {
    extractionCache.set(normKey, { timestamp: Date.now(), data: result });
    return result;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error('Please enter a valid URL');
  }

  const host = parsedUrl.hostname.replace(/^(www\.|mobile\.)/, '').toLowerCase();

  // 1. Imgur .gifv direct rewrite (.gifv is an HTML wrapper around an .mp4 stream)
  if (host.includes('imgur.com') && /\.gifv(\?.*)?$/i.test(url)) {
    const mp4Url = url.replace(/\.gifv(\?.*)?$/i, '.mp4').replace('//imgur.com/', '//i.imgur.com/');
    return cacheAndReturn({
      success: true,
      source: 'imgur',
      mediaType: 'video',
      videoUrl: mp4Url,
      title: 'Imgur GIFV',
      author: 'Imgur',
      duration: null,
      thumbnail: null
    });
  }

  // 2. GIPHY URLs (both share pages like giphy.com/gifs/... and CDN links like i.giphy.com/...)
  if (host.includes('giphy.com')) {
    const giphyResolved = tryResolveGiphyUrl(url);
    if (giphyResolved) {
      return cacheAndReturn(giphyResolved);
    }
  }

  // 3. Direct Media File Extension (.gif, .mp4, .webm, .mov, .webp, .apng, .png, .jpg)
  // Note: Exclude tenor.com/xxxx.gif share URLs (which redirect to HTML pages) from raw passthrough
  const isTenorPageGif = (host === 'tenor.com') && !host.startsWith('media') && !host.startsWith('c.');
  if (!isTenorPageGif && (/\.(mp4|gif|webm|mov|m4v|webp|apng|png|jpe?g)(\?.*)?$/i.test(parsedUrl.pathname) || host === 'video.twimg.com')) {
    const isGifOrImg = /\.(gif|webp|apng|png|jpe?g)$/i.test(parsedUrl.pathname);
    return cacheAndReturn({
      success: true,
      source: 'direct',
      mediaType: isGifOrImg ? 'gif' : 'video',
      videoUrl: url,
      title: isGifOrImg ? 'Direct Animated GIF' : 'Direct Video Link',
      author: host || 'Direct URL',
      duration: null,
      thumbnail: isGifOrImg ? url : null
    });
  }

  // 4. Twitter / X Post URLs
  if (isTwitterHost(host)) {
    const statusMatch = url.match(/status\/(\d+)/);
    const statusId = statusMatch ? statusMatch[1] : null;

    // Strategy A: yt-dlp
    try {
      const info = await extractWithYtDlp(url);
      const { videoUrl, mediaType } = pickBestYtDlpFormat(info);
      return cacheAndReturn({
        success: true,
        source: 'twitter',
        mediaType,
        videoUrl,
        title: info.title || info.description || 'Twitter GIF',
        author: info.uploader || (info.channel ? `@${info.channel}` : 'Twitter User'),
        duration: info.duration || 3.0,
        thumbnail: info.thumbnail || null
      });
    } catch (ytErr) {
      console.warn('yt-dlp Twitter extraction failed, attempting fallback...', ytErr.message);
    }

    // Strategy B: FxTwitter fallback
    if (statusId) {
      try {
        const fxInfo = await extractWithFxTwitter(url);
        return cacheAndReturn({
          success: true,
          source: 'fxtwitter',
          mediaType: fxInfo.mediaType || 'video',
          videoUrl: fxInfo.url,
          title: fxInfo.title,
          author: fxInfo.uploader,
          duration: fxInfo.duration || 3.0,
          thumbnail: fxInfo.thumbnail
        });
      } catch (fxErr) {
        console.warn('FxTwitter fallback failed:', fxErr.message);
      }

      // Strategy C: VxTwitter fallback
      try {
        const vxInfo = await extractWithVxTwitter(statusId);
        return cacheAndReturn({
          success: true,
          source: 'vxtwitter',
          mediaType: vxInfo.mediaType || 'video',
          videoUrl: vxInfo.url,
          title: vxInfo.title,
          author: vxInfo.uploader,
          duration: vxInfo.duration || 3.0,
          thumbnail: vxInfo.thumbnail
        });
      } catch (vxErr) {
        console.warn('VxTwitter fallback failed:', vxErr.message);
      }
    }

    throw new Error('Could not find any video or GIF in this tweet. Please ensure the post has media attached and is publicly accessible.');
  }

  // 5. Universal HTTP Probe (Follows redirects, detects extensionless image/gif/video streams, or scrapes HTML OpenGraph)
  let htmlExtracted = null;
  let finalProbedUrl = url;

  try {
    const probe = await probeUrlAndFetchHtml(url);
    finalProbedUrl = probe.finalUrl || url;
    const ct = probe.contentType || '';

    // Did a short link (e.g. t.co, bit.ly, gph.is, pin.it) redirect to Twitter or GIPHY?
    const finalHost = new URL(finalProbedUrl).hostname.replace(/^(www\.|mobile\.)/, '').toLowerCase();
    if (finalProbedUrl !== url && (isTwitterHost(finalHost) || finalHost.includes('giphy.com'))) {
      return await resolveMedia(finalProbedUrl);
    }

    // Direct extensionless GIF / WebP / image stream detected via HTTP Content-Type!
    if (ct.startsWith('image/')) {
      return cacheAndReturn({
        success: true,
        source: 'direct',
        mediaType: 'gif',
        videoUrl: finalProbedUrl,
        title: 'Direct GIF / Image',
        author: finalHost || 'Direct Link',
        duration: null,
        thumbnail: finalProbedUrl
      });
    }

    // Direct extensionless video stream detected via HTTP Content-Type!
    if (ct.startsWith('video/')) {
      return cacheAndReturn({
        success: true,
        source: 'direct',
        mediaType: 'video',
        videoUrl: finalProbedUrl,
        title: 'Direct Video Link',
        author: finalHost || 'Direct Link',
        duration: null,
        thumbnail: null
      });
    }

    // If HTML page, extract embedded GIF / video from OpenGraph / meta / tags
    if (probe.html) {
      htmlExtracted = extractMediaFromHtml(probe.html, finalProbedUrl);
      // If we found a concrete GIF or direct video (not a generic fallback og:image), return immediately!
      if (htmlExtracted && !htmlExtracted.isFallbackImage) {
        return cacheAndReturn(htmlExtracted);
      }
    }
  } catch (probeErr) {
    console.warn('HTTP probe notice:', probeErr.message);
  }

  // 6. Universal yt-dlp Extraction (Handles Reddit, TikTok, Instagram, Pinterest, Tumblr, YouTube, Imgur, Streamable, etc.)
  try {
    const info = await extractWithYtDlp(finalProbedUrl);
    const { videoUrl, mediaType } = pickBestYtDlpFormat(info);
    if (videoUrl) {
      let resolvedHost = host;
      try { resolvedHost = new URL(finalProbedUrl).hostname.replace(/^www\./, ''); } catch (e) {}
      return cacheAndReturn({
        success: true,
        source: info.extractor_key ? info.extractor_key.toLowerCase() : resolvedHost,
        mediaType,
        videoUrl,
        title: info.title || info.description || 'Animated Media',
        author: info.uploader || info.channel || resolvedHost,
        duration: info.duration || 3.0,
        thumbnail: info.thumbnail || null
      });
    }
  } catch (ytErr) {
    console.warn('Universal yt-dlp extraction notice:', ytErr.message);
  }

  // 7. If HTML scraping found a fallback image (e.g. og:image without .gif extension), return it
  if (htmlExtracted) {
    delete htmlExtracted.isFallbackImage;
    return cacheAndReturn(htmlExtracted);
  }

  throw new Error('Could not find a GIF or video at this link. Try pasting a direct .gif / .mp4 link or a post URL from GIPHY, Tenor, Imgur, Reddit, Twitter/X, or Pinterest.');
}

module.exports = {
  resolveMedia,
  extractWithYtDlp
};
