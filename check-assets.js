const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');

['starter1.webp', 'starter2.webp', 'starter3.webp', 'tray.webp'].forEach(f => {
  try {
    execSync(`"${ffmpeg}" -i android/app/src/main/assets/${f}`, { stdio: 'pipe' });
  } catch (e) {
    const s = e.stderr ? e.stderr.toString() : '';
    const line = s.split('\n').find(l => l.includes('Stream #0:0'));
    console.log(f, line ? line.trim() : 'no stream');
  }
});

