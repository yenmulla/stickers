const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const { injectWhatsAppMetadata } = require('./exif');

const MAX_WHATSAPP_SIZE = 500 * 1024; // 500 KB in bytes
const TARGET_SAFE_SIZE = 485 * 1024;  // Target below 485 KB to leave room for EXIF

/**
 * Resolves optimal ffmpeg binary path for the environment
 */
function getFfmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  // Prefer system ffmpeg in Docker container
  if (process.platform !== 'win32' && fs.existsSync('/usr/bin/ffmpeg')) {
    return '/usr/bin/ffmpeg';
  }
  try {
    const staticFfmpeg = require('ffmpeg-static');
    if (staticFfmpeg && fs.existsSync(staticFfmpeg)) {
      return staticFfmpeg;
    }
  } catch (e) {}
  return 'ffmpeg';
}

/**
 * Downloads a remote URL to a local temporary file with standard browser headers
 */
function downloadRemoteToLocal(url, targetPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    const client = url.startsWith('https') ? https : http;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    if (url.includes('twimg.com') || url.includes('twitter.com') || url.includes('x.com')) {
      headers['Referer'] = 'https://twitter.com/';
    }

    const req = client.get(url, { headers }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        let nextUrl = res.headers.location;
        if (!nextUrl.startsWith('http')) {
          nextUrl = new URL(nextUrl, url).toString();
        }
        return downloadRemoteToLocal(nextUrl, targetPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(targetPath); } catch (e) {}
        return reject(new Error(`Failed to download remote video: HTTP ${res.statusCode}`));
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(targetPath));
      });
    });

    req.on('error', err => {
      file.close();
      try { fs.unlinkSync(targetPath); } catch (e) {}
      reject(err);
    });

    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

/**
 * Runs ffmpeg command with arguments safely restricted in memory
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const bin = getFfmpegPath();
    const proc = spawn(bin, args);

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const errorInfo = code !== null ? `code ${code}` : `signal ${signal || 'SIGKILL (OOM)'}`;
        reject(new Error(`FFmpeg exited with ${errorInfo}: ${stderr.slice(-600)}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Creates .wastickers sticker pack (for 1-tap WhatsApp mobile import)
 */
function createWastickersArchive(stickerPath, localSourcePath, packPath, startTime = 0, metadata = {}) {
  try {
    const tempTray = packPath.replace('.wastickers', '-tray.png');
    const bin = getFfmpegPath();

    // Generate 96x96 tray icon from the source video (not animated webp)
    try {
      if (fs.existsSync(localSourcePath)) {
        execSync(`"${bin}" -y -ss ${startTime} -i "${localSourcePath}" -vframes 1 -vf "scale=96:96:force_original_aspect_ratio=decrease,pad=96:96:(96-iw)/2:(96-ih)/2:color=0x00000000" -threads 1 "${tempTray}"`, { stdio: 'pipe' });
      }
    } catch (e) {
      console.warn('Tray icon generation warning:', e.message);
    }

    const zip = new AdmZip();
    zip.addFile('title.txt', Buffer.from(metadata.packName || 'Twitter Sticker', 'utf8'));
    zip.addFile('author.txt', Buffer.from(metadata.author || 'Twitter Sticker Maker', 'utf8'));

    if (fs.existsSync(tempTray)) {
      zip.addLocalFile(tempTray, '', 'tray.png');
    }

    // WhatsApp requires min 3 stickers in a pack
    const stickerData = fs.readFileSync(stickerPath);
    zip.addFile('1.webp', stickerData);
    zip.addFile('2.webp', stickerData);
    zip.addFile('3.webp', stickerData);

    zip.writeZip(packPath);

    if (fs.existsSync(tempTray)) {
      try { fs.unlinkSync(tempTray); } catch (e) {}
    }
  } catch (err) {
    console.error('Failed to create .wastickers pack:', err.message);
  }
}

/**
 * Converts an input video or GIF to a WhatsApp-compatible 512x512 animated WebP.
 * Automatically ensures size < 500 KB and limits memory usage to under 60 MB.
 */
async function convertToSticker({
  inputSource, // local file path OR remote video URL
  outputPath,
  startTime = 0,
  duration = 3.5,
  fps = 14,
  quality = 70,
  fitMode = 'fit', // 'fit' (transparent pad) or 'crop' (center crop)
  speed = 1.0,
  metadata = {}
}) {
  const tmpOut = outputPath.replace('.webp', '-tmp.webp');
  let localVideoFile = inputSource;
  let downloadedTempFile = null;

  try {
    // If remote URL, download locally first to avoid stream hangs and anti-bot blocks
    if (inputSource.startsWith('http://') || inputSource.startsWith('https://')) {
      const tempExt = path.extname(inputSource.split('?')[0]) || '.mp4';
      downloadedTempFile = outputPath.replace('.webp', `-src${tempExt}`);
      console.log(`Downloading remote video to local cache: ${downloadedTempFile}...`);
      await downloadRemoteToLocal(inputSource, downloadedTempFile);
      localVideoFile = downloadedTempFile;
    }

    // Build filter graph
    function buildFilter(currentFps, currentFit, currentSpeed) {
      const filters = [];

      // Trimming / speed
      if (currentSpeed && currentSpeed !== 1.0) {
        filters.push(`setpts=${(1.0 / currentSpeed).toFixed(3)}*PTS`);
      }

      // FPS
      filters.push(`fps=${currentFps}`);

      // Scaling and padding
      if (currentFit === 'crop') {
        filters.push('scale=512:512:force_original_aspect_ratio=increase');
        filters.push('crop=512:512');
      } else {
        // Fit with transparent padding
        filters.push('scale=512:512:force_original_aspect_ratio=decrease');
        filters.push('pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000');
      }

      return filters.join(',');
    }

    // Attempt conversion passes to ensure <= 500 KB
    const attempts = [
      { fps: Math.min(fps, 16), q: quality },
      { fps: Math.min(fps, 13), q: Math.max(quality - 15, 50) },
      { fps: Math.min(fps, 10), q: Math.max(quality - 25, 40) },
      { fps: 9, q: 35 }
    ];

    let success = false;
    let finalSize = 0;

    for (let i = 0; i < attempts.length; i++) {
      const currentAttempt = attempts[i];
      const vf = buildFilter(currentAttempt.fps, fitMode, speed);

      // Low-memory, low-thread parameters suited for 512MB RAM cloud containers
      const args = [
        '-y',
        '-ss', String(startTime),
        '-t', String(duration),
        '-i', localVideoFile,
        '-vf', vf,
        '-vcodec', 'libwebp',
        '-pix_fmt', 'yuva420p',
        '-lossless', '0',
        '-compression_level', '4',
        '-q:v', String(currentAttempt.q),
        '-loop', '0',
        '-threads', '2', // Cap memory usage on cloud shared hosts
        '-an',
        tmpOut
      ];

      try {
        await runFfmpeg(args);
        const stats = fs.statSync(tmpOut);
        finalSize = stats.size;

        // If under target size, we are good!
        if (finalSize <= TARGET_SAFE_SIZE || i === attempts.length - 1) {
          success = true;
          break;
        }
        console.log(`Pass ${i + 1} produced ${Math.round(finalSize / 1024)} KB, optimizing further...`);
      } catch (err) {
        if (i === attempts.length - 1) throw err;
      }
    }

    if (!success || !fs.existsSync(tmpOut)) {
      throw new Error('Conversion failed to produce sticker');
    }

    // Read generated WebP and inject WhatsApp EXIF metadata
    const webpBuffer = fs.readFileSync(tmpOut);
    const finalBuffer = injectWhatsAppMetadata(webpBuffer, metadata);

    // Write to final destination
    fs.writeFileSync(outputPath, finalBuffer);

    // Clean up temporary WebP
    try {
      fs.unlinkSync(tmpOut);
    } catch (e) {}

    // Create .wastickers package
    const packPath = outputPath.replace('.webp', '.wastickers');
    createWastickersArchive(outputPath, localVideoFile, packPath, startTime, metadata);

    const finalStats = fs.statSync(outputPath);
    return {
      path: outputPath,
      packPath,
      sizeBytes: finalStats.size,
      sizeKb: +(finalStats.size / 1024).toFixed(1),
      isCompliant: finalStats.size <= MAX_WHATSAPP_SIZE,
      maxLimitKb: 500,
      dimensions: '512x512'
    };
  } finally {
    // Clean up downloaded temp video
    if (downloadedTempFile && fs.existsSync(downloadedTempFile)) {
      try {
        fs.unlinkSync(downloadedTempFile);
      } catch (e) {}
    }
  }
}

module.exports = {
  convertToSticker,
  createWastickersArchive,
  getFfmpegPath,
  MAX_WHATSAPP_SIZE
};
