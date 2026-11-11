const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const src = path.join(__dirname, 'public/logo.png');
const assetsDir = path.join(__dirname, 'android/app/src/main/assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

const dstPng = path.join(assetsDir, 'tray.png');
const dstWebp = path.join(assetsDir, 'tray.webp');

try {
  execSync(`"${ffmpeg}" -y -i "${src}" -vf "scale=96:96" "${dstPng}"`);
  execSync(`"${ffmpeg}" -y -i "${src}" -vf "scale=96:96" "${dstWebp}"`);
  console.log("Tray icons generated successfully at:", dstPng, dstWebp);
} catch (e) {
  console.error("Error generating tray icon:", e);
}
