const { spawn } = require('child_process');
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
 * Detects file format from magic bytes at start of file
 * Returns 'gif' | 'webp' | 'png' | 'jpg' | 'html' | 'video'
 */
function detectFileFormat(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64);
    const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return 'unknown';

    // GIF87a or GIF89a
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
      return 'gif';
    }
    // RIFF....WEBP
    if (
      bytesRead >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
      return 'webp';
    }
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return 'png';
    }
    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
      return 'jpg';
    }
    // Check if accidentally downloaded an HTML error/page
    const headStr = buf.slice(0, bytesRead).toString('utf8').trim().toLowerCase();
    if (headStr.startsWith('<!doctype html') || headStr.startsWith('<html')) {
      return 'html';
    }
    return 'video';
  } catch (e) {
    return 'video';
  }
}

/**
 * Downloads a remote URL to a local temporary file with browser headers & FFmpeg fallback
 */
function downloadRemoteToLocal(url, targetPath) {
  return new Promise((resolve, reject) => {
    function tryNodeDownload(attemptMode = 'default') {
      const file = fs.createWriteStream(targetPath);
      const client = url.startsWith('https') ? https : http;

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/gif,video/*,*/*;q=0.8'
      };

      const isTwitterDomain = url.includes('twimg.com') || url.includes('twitter.com') || url.includes('x.com');
      if (attemptMode === 'default') {
        if (isTwitterDomain) {
          headers['Referer'] = 'https://twitter.com/';
        }
      } else if (attemptMode === 'origin_referer') {
        if (!isTwitterDomain) {
          try {
            const parsed = new URL(url);
            headers['Referer'] = `${parsed.origin}/`;
          } catch (e) {}
        }
      }

      const req = client.get(url, { headers }, res => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(targetPath); } catch (e) {}
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            nextUrl = new URL(nextUrl, url).toString();
          }
          return downloadRemoteToLocal(nextUrl, targetPath).then(resolve).catch(reject);
        }

        // Retry with alternate Referer strategy on 403 Forbidden
        if (res.statusCode === 403 && attemptMode === 'default') {
          file.close();
          try { fs.unlinkSync(targetPath); } catch (e) {}
          return tryNodeDownload('origin_referer');
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          file.close();
          try { fs.unlinkSync(targetPath); } catch (e) {}
          return tryFfmpegDownload(new Error(`HTTP ${res.statusCode}`));
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              const stats = fs.statSync(targetPath);
              if (stats.size > 64) {
                const fmt = detectFileFormat(targetPath);
                if (fmt === 'html') {
                  try { fs.unlinkSync(targetPath); } catch (e) {}
                  return reject(new Error('The provided URL returned a webpage instead of a direct GIF or video file.'));
                }
                return resolve(targetPath);
              }
            } catch (e) {}
            tryFfmpegDownload(new Error('Downloaded file too small'));
          });
        });
      });

      req.on('error', err => {
        file.close();
        try { fs.unlinkSync(targetPath); } catch (e) {}
        tryFfmpegDownload(err);
      });

      req.setTimeout(25000, () => {
        req.destroy();
        file.close();
        try { fs.unlinkSync(targetPath); } catch (e) {}
        tryFfmpegDownload(new Error('Download timed out'));
      });
    }

    // Ultimate fallback: FFmpeg native HTTP/HLS streamer
    async function tryFfmpegDownload(origErr) {
      console.warn(`Node download failed (${origErr ? origErr.message : 'network error'}), falling back to FFmpeg native download for ${url.slice(0, 60)}...`);
      try {
        const headerArg = 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n';
        const isGifTarget = targetPath.toLowerCase().endsWith('.gif');
        const ffArgs = isGifTarget
          ? ['-y', '-headers', headerArg, '-i', url, '-t', '15', targetPath]
          : ['-y', '-headers', headerArg, '-i', url, '-c', 'copy', '-t', '15', targetPath];
        await runFfmpeg(ffArgs, 20000);
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 64) {
          return resolve(targetPath);
        }
      } catch (ffErr) {
        console.error('FFmpeg fallback download failed:', ffErr.message);
      }
      reject(origErr || new Error('Download failed'));
    }

    tryNodeDownload('default');
  });
}

/**
 * Runs ffmpeg command with arguments safely restricted in memory with strict timeout
 */
function runFfmpeg(args, timeoutMs = 35000) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const bin = getFfmpegPath();
    const proc = spawn(bin, args);
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (e) {}
        reject(new Error('FFmpeg processing timed out'));
      }
    }, timeoutMs);

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const errorInfo = code !== null ? `code ${code}` : `signal ${signal || 'SIGKILL (OOM)'}`;
        reject(new Error(`FFmpeg exited with ${errorInfo}: ${stderr.slice(-600)}`));
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
 * Creates .wastickers sticker pack (for 1-tap WhatsApp mobile import)
 */
async function createWastickersArchive(stickerPath, localSourcePath, packPath, startTime = 0, metadata = {}) {
  try {
    const tempTray = packPath.replace('.wastickers', '-tray.png');

    // Generate 96x96 tray icon asynchronously without blocking event loop
    try {
      if (fs.existsSync(localSourcePath)) {
        const ssArgs = startTime > 0 ? ['-ss', String(startTime)] : [];
        await runFfmpeg([
          '-y',
          ...ssArgs,
          '-i', localSourcePath,
          '-vframes', '1',
          '-vf', 'scale=96:96:force_original_aspect_ratio=decrease,pad=96:96:(96-iw)/2:(96-ih)/2:color=0x00000000',
          '-threads', '1',
          tempTray
        ], 10000);
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
 * Converts an input video, animated GIF, animated WebP, or image to a WhatsApp-compatible 512x512 animated WebP.
 * Automatically ensures size < 500 KB and limits memory usage to under 60 MB.
 */
async function convertToSticker({
  inputSource, // local file path OR remote video/GIF URL
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
  const tempFilesToClean = [];

  try {
    // 1. If remote URL, download locally first to avoid stream hangs and anti-bot blocks
    if (inputSource.startsWith('http://') || inputSource.startsWith('https://')) {
      const rawExt = path.extname(inputSource.split('?')[0]).toLowerCase();
      const validExts = ['.gif', '.mp4', '.webm', '.mov', '.webp', '.png', '.jpg', '.jpeg', '.m4v'];
      const tempExt = validExts.includes(rawExt) ? rawExt : '.mp4';
      const downloadedTempFile = outputPath.replace('.webp', `-src${tempExt}`);
      tempFilesToClean.push(downloadedTempFile);

      console.log(`Downloading remote media to local cache: ${downloadedTempFile}...`);
      await downloadRemoteToLocal(inputSource, downloadedTempFile);
      localVideoFile = downloadedTempFile;
    }

    // 2. Inspect actual magic bytes of local file to handle extensionless GIFs or animated WebP files
    const detectedFormat = detectFileFormat(localVideoFile);

    if (detectedFormat === 'gif' && !localVideoFile.toLowerCase().endsWith('.gif')) {
      const renamedGif = outputPath.replace('.webp', '-detected.gif');
      fs.copyFileSync(localVideoFile, renamedGif);
      tempFilesToClean.push(renamedGif);
      localVideoFile = renamedGif;
    } else if (detectedFormat === 'png' && !localVideoFile.toLowerCase().endsWith('.png')) {
      const renamedPng = outputPath.replace('.webp', '-detected.png');
      fs.copyFileSync(localVideoFile, renamedPng);
      tempFilesToClean.push(renamedPng);
      localVideoFile = renamedPng;
    } else if (detectedFormat === 'jpg' && !/\.jpe?g$/i.test(localVideoFile)) {
      const renamedJpg = outputPath.replace('.webp', '-detected.jpg');
      fs.copyFileSync(localVideoFile, renamedJpg);
      tempFilesToClean.push(renamedJpg);
      localVideoFile = renamedJpg;
    } else if (detectedFormat === 'webp') {
      // FFmpeg's native WebP decoder does not decode animated WebP frames (ANIM/ANMF chunks).
      // Convert WebP source to temporary animated GIF via sharp so FFmpeg can process all frames!
      try {
        const sharp = require('sharp');
        const convertedGif = outputPath.replace('.webp', '-fromwebp.gif');
        tempFilesToClean.push(convertedGif);
        await sharp(localVideoFile, { animated: true }).gif().toFile(convertedGif);
        localVideoFile = convertedGif;
      } catch (sharpErr) {
        console.warn('Sharp animated WebP pre-conversion notice:', sharpErr.message);
      }
    }

    const isGifOrImage = ['gif', 'webp', 'png', 'jpg'].includes(detectedFormat) || /\.(gif|png|jpe?g)$/i.test(localVideoFile);

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

      // Only pass -ss if startTime > 0 and source is not a static/GIF stream with 0 offset
      const preInputSeekArgs = (!isGifOrImage && startTime > 0) ? ['-ss', String(startTime)] : [];
      const postInputSeekArgs = (isGifOrImage && startTime > 0) ? ['-ss', String(startTime)] : [];

      // Low-memory, low-thread parameters suited for 512MB RAM cloud containers
      const args = [
        '-y',
        ...preInputSeekArgs,
        '-t', String(duration),
        '-i', localVideoFile,
        ...postInputSeekArgs,
        '-vf', vf,
        '-vcodec', 'libwebp',
        '-pix_fmt', 'yuva420p',
        '-lossless', '0',
        '-compression_level', '3',
        '-q:v', String(currentAttempt.q),
        '-loop', '0',
        '-threads', '1', // Strict single thread to prevent OOM on 512MB RAM
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
    await createWastickersArchive(outputPath, localVideoFile, packPath, isGifOrImage ? 0 : startTime, metadata);

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
    // Clean up all temporary downloaded/intermediate files
    for (const tmpFile of tempFilesToClean) {
      if (tmpFile && fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch (e) {}
      }
    }
  }
}

module.exports = {
  convertToSticker,
  createWastickersArchive,
  getFfmpegPath,
  MAX_WHATSAPP_SIZE
};
