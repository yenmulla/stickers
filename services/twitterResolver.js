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
 * Main resolution function
 */
async function resolveMedia(inputUrl) {
  const url = inputUrl.trim();

  // 1. Check if directly a video or gif URL
  if (url.match(/\.(mp4|gif|webm|mov)(\?.*)?$/i) || url.includes('video.twimg.com') || url.includes('giphy.com') || url.includes('tenor.com')) {
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
  const isTwitter = /^(https?:\/\/)?(www\.)?(mobile\.)?(twitter|x)\.com\/.+/i.test(url);
  if (!isTwitter) {
    throw new Error('Please enter a valid Twitter/X post link or direct media URL');
  }

  // Strategy A: yt-dlp
  try {
    const info = await extractWithYtDlp(url);

    // Pick best format: prefer mp4, resolution <= 720p (perfect for 512x512 sticker)
    let videoUrl = info.url;
    if (info.formats && info.formats.length > 0) {
      // Filter for mp4 formats with video
      const mp4s = info.formats.filter(f => f.ext === 'mp4' && f.vcodec !== 'none' && f.url);
      if (mp4s.length > 0) {
        // Find format closest to 512px height/width
        const sorted = mp4s.sort((a, b) => {
          const resA = Math.abs((a.height || 480) - 512);
          const resB = Math.abs((b.height || 480) - 512);
          return resA - resB;
        });
        videoUrl = sorted[0].url;
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

  throw new Error('Could not find any video or GIF in this tweet. Please ensure the tweet has a video/GIF attached and is publicly accessible.');
}

module.exports = {
  resolveMedia,
  extractWithYtDlp
};

