const ffmpegPath = require('ffmpeg-static');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { injectWhatsAppMetadata } = require('./exif');

const MAX_WHATSAPP_SIZE = 500 * 1024; // 500 KB in bytes
const TARGET_SAFE_SIZE = 485 * 1024;  // Target below 485 KB to leave room for EXIF

/**
 * Runs ffmpeg command with arguments
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const proc = spawn(ffmpegPath, args);

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-600)}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Creates .wastickers sticker pack (for 1-tap WhatsApp mobile import)
 */
function createWastickersArchive(stickerPath, packPath, metadata = {}) {
  try {
    const tempTray = packPath.replace('.wastickers', '-tray.png');
    
    // Generate 96x96 tray icon (first frame of sticker)
    try {
      execSync(`"${ffmpegPath}" -y -i "${stickerPath}" -vframes 1 -vf "scale=96:96:force_original_aspect_ratio=decrease,pad=96:96:(96-iw)/2:(96-ih)/2:color=0x00000000" -update 1 "${tempTray}"`);
    } catch (e) {
      console.warn('Tray icon generation error, using fallback');
    }

    const zip = new AdmZip();
    zip.addFile('title.txt', Buffer.from(metadata.packName || 'Twitter Sticker', 'utf8'));
    zip.addFile('author.txt', Buffer.from(metadata.author || 'Twitter Sticker Maker', 'utf8'));

    if (fs.existsSync(tempTray)) {
      zip.addLocalFile(tempTray, '', 'tray.png');
    }

    // Include 3 sticker slots (WhatsApp sticker pack requirement)
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
 * Automatically ensures size < 500 KB.
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

    const args = [
      '-y',
      '-ss', String(startTime),
      '-t', String(duration),
      '-i', inputSource,
      '-vf', vf,
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-compression_level', '4',
      '-q:v', String(currentAttempt.q),
      '-loop', '0',
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

  // Clean up temporary file
  try {
    fs.unlinkSync(tmpOut);
  } catch (e) {}

  // Also create .wastickers package
  const packPath = outputPath.replace('.webp', '.wastickers');
  createWastickersArchive(outputPath, packPath, metadata);

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
}

module.exports = {
  convertToSticker,
  createWastickersArchive,
  MAX_WHATSAPP_SIZE
};
