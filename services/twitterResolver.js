const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

/**
 * Executes yt-dlp to inspect and extract video information
 */
function extractWithYtDlp(url) {
  return new Promise((resolve, reject) => {
    const python = process.platform === 'win32' ? 'python' : (process.env.PYTHON_BIN || 'python3');
    const args = ['-m', 'yt_dlp', '--dump-json', '--no-warnings', '--no-check-certificates', url];

    let stdout = '';
    let stderr = '';

    const proc = spawn(python, args);

    proc.stdout.on('data', chunk => stdout += chunk);
    proc.stderr.on('data', chunk => stderr += chunk);

    proc.on('close', code => {
      if (code === 0 && stdout.trim()) {
        try {
          const info = JSON.parse(stdout.trim());
          resolve(info);
        } catch (e) {
          reject(new Error('Failed to parse yt-dlp JSON: ' + e.message));
        }
      } else {
        reject(new Error(stderr || 'yt-dlp exited with code ' + code));
      }
    });

    proc.on('error', err => reject(err));
  });
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
                duration: videos[0].duration || 0
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
 * Expands short URLs (like t.co) by following redirects
 */
function resolveRedirects(initialUrl, maxRedirects = 5) {
  return new Promise((resolve) => {
    let currentUrl = initialUrl;
    let redirectCount = 0;

    function step(urlStr) {
      if (redirectCount >= maxRedirects) return resolve(urlStr);
      try {
        const parsed = new URL(urlStr);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.request(urlStr, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            redirectCount++;
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http')) {
              nextUrl = new URL(nextUrl, urlStr).toString();
            }
            return step(nextUrl);
          }
          resolve(urlStr);
        });
        req.on('error', () => resolve(urlStr));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(urlStr);
        });
        req.end();
      } catch (e) {
        resolve(urlStr);
      }
    }

    step(currentUrl);
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
                duration: vid.duration_millis ? vid.duration_millis / 1000 : 3.0
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
 * Main resolution function
 */
async function resolveMedia(inputUrl) {
  let url = inputUrl.trim();

  // If protocol missing, add https
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
    url = 'https://' + url;
  }

  // Resolve short links like t.co
  if (/^https?:\/\/t\.co\//i.test(url) || /^https?:\/\/bit\.ly\//i.test(url)) {
    url = await resolveRedirects(url);
  }

  // 1. Check if directly a video or gif URL
  if (url.match(/\.(mp4|gif|webm|mov)(\?.*)?$/i) || 
      url.includes('video.twimg.com') || 
      url.includes('giphy.com') || 
      url.includes('tenor.com') || 
      url.includes('imgur.com')) {
    return {
      success: true,
      source: 'direct',
      videoUrl: url,
      title: 'Direct Media Link',
      author: 'Direct URL',
      duration: null,
      thumbnail: null
    };
  }

  // 2. Check if Twitter/X URL
  const isTwitter = /^(https?:\/\/)?(www\.)?(mobile\.)?(twitter|x|fxtwitter|vxtwitter|fixupx)\.com\/.+/i.test(url);
  if (!isTwitter) {
    throw new Error('Please enter a valid Twitter/X post link or direct media URL');
  }

  const statusMatch = url.match(/status\/(\d+)/);
  const statusId = statusMatch ? statusMatch[1] : null;

  // Strategy A: yt-dlp
  try {
    const info = await extractWithYtDlp(url);

    // Pick best format: prefer direct progressive MP4, resolution <= 720p (avoids unplayable m3u8 playlists on mobile)
    let videoUrl = info.url;
    if (info.formats && info.formats.length > 0) {
      // 1. Direct progressive MP4 streams that mobile browsers can play natively
      const directMp4s = info.formats.filter(f => 
        f.ext === 'mp4' && 
        f.vcodec !== 'none' && 
        f.url && 
        !f.url.includes('.m3u8') && 
        (!f.protocol || f.protocol === 'http' || f.protocol === 'https')
      );

      if (directMp4s.length > 0) {
        // Find format closest to 512px height/width
        const sorted = directMp4s.sort((a, b) => {
          const resA = Math.abs((a.height || 480) - 512);
          const resB = Math.abs((b.height || 480) - 512);
          return resA - resB;
        });
        videoUrl = sorted[0].url;
      } else {
        // 2. Any other mp4 format
        const otherMp4s = info.formats.filter(f => f.ext === 'mp4' && f.vcodec !== 'none' && f.url);
        if (otherMp4s.length > 0) {
          videoUrl = otherMp4s[0].url;
        }
      }
    }

    return {
      success: true,
      source: 'twitter',
      videoUrl: videoUrl,
      title: info.title || info.description || 'Twitter GIF',
      author: info.uploader || (info.channel ? `@${info.channel}` : 'Twitter User'),
      duration: info.duration || 3.0,
      thumbnail: info.thumbnail || null
    };
  } catch (ytErr) {
    console.warn('yt-dlp extraction failed, attempting fallback...', ytErr.message);
  }

  // Strategy B: FxTwitter fallback
  if (statusId) {
    try {
      const fxInfo = await extractWithFxTwitter(url);
      return {
        success: true,
        source: 'fxtwitter',
        videoUrl: fxInfo.url,
        title: fxInfo.title,
        author: fxInfo.uploader,
        duration: fxInfo.duration || 3.0,
        thumbnail: fxInfo.thumbnail
      };
    } catch (fxErr) {
      console.warn('FxTwitter fallback failed:', fxErr.message);
    }

    // Strategy C: VxTwitter fallback
    try {
      const vxInfo = await extractWithVxTwitter(statusId);
      return {
        success: true,
        source: 'vxtwitter',
        videoUrl: vxInfo.url,
        title: vxInfo.title,
        author: vxInfo.uploader,
        duration: vxInfo.duration || 3.0,
        thumbnail: vxInfo.thumbnail
      };
    } catch (vxErr) {
      console.warn('VxTwitter fallback failed:', vxErr.message);
    }
  }

  throw new Error('Could not find any video or GIF in this tweet. Please ensure the tweet has a video/GIF attached and is publicly accessible.');
}

module.exports = {
  resolveMedia,
  extractWithYtDlp
};

