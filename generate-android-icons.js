const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'public', 'logo.png');
const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

for (const [folder, size] of Object.entries(sizes)) {
  const dir = path.join(resDir, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'ic_launcher.png');
  const roundOut = path.join(dir, 'ic_launcher_round.png');
  execSync(`"${ffmpeg}" -y -i "${src}" -vf "scale=${size}:${size}" "${out}"`);
  execSync(`"${ffmpeg}" -y -i "${src}" -vf "scale=${size}:${size}" "${roundOut}"`);
  console.log(`Generated ${folder}/ic_launcher.png (${size}x${size})`);
}

// Also generate tray icon for default pack
const trayDst = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'tray.webp');
execSync(`"${ffmpeg}" -y -i "${src}" -vf "scale=96:96" "${trayDst}"`);
console.log('Updated starter tray.webp');

