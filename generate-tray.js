const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const path = require('path');

const src = path.join(__dirname, 'public/samples/sample-bars.mp4');
const dst = path.join(__dirname, 'android/app/src/main/assets/tray.webp');

try {
  execSync(`"${ffmpeg}" -y -i "${src}" -vf "scale=96:96:force_original_aspect_ratio=decrease,pad=96:96:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -vframes 1 "${dst}"`);
  console.log("Tray icon generated successfully at:", dst);
} catch (e) {
  console.error("Error generating tray icon:", e);
}
