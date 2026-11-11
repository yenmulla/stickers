const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const samplesDir = path.join(__dirname, 'public', 'samples');
if (!fs.existsSync(samplesDir)) {
  fs.mkdirSync(samplesDir, { recursive: true });
}

console.log('Generating sample reaction clips...');

// Sample 1: Rainbow SMPTE
const sample1 = path.join(samplesDir, 'sample-bars.mp4');
if (!fs.existsSync(sample1)) {
  execSync(`"${ffmpeg}" -y -f lavfi -i "smptebars=size=480x480:rate=24" -t 3 -pix_fmt yuv420p "${sample1}"`);
}

// Sample 2: Color TV Test Patterns
const sample2 = path.join(samplesDir, 'sample-testsrc.mp4');
if (!fs.existsSync(sample2)) {
  execSync(`"${ffmpeg}" -y -f lavfi -i "testsrc=size=480x480:rate=24" -t 3 -pix_fmt yuv420p "${sample2}"`);
}

// Sample 3: Mandelbrot zoom
const sample3 = path.join(samplesDir, 'sample-mandelbrot.mp4');
if (!fs.existsSync(sample3)) {
  execSync(`"${ffmpeg}" -y -f lavfi -i "mandelbrot=size=480x480:rate=24" -t 3 -pix_fmt yuv420p "${sample3}"`);
}

// Sample 4: Earth Rotating GIF from Wikimedia (if downloaded earlier)
const earthGif = path.join(__dirname, 'sample-earth.gif');
const sampleEarth = path.join(samplesDir, 'sample-earth.gif');
if (fs.existsSync(earthGif) && !fs.existsSync(sampleEarth)) {
  fs.copyFileSync(earthGif, sampleEarth);
}

console.log('Sample generation completed successfully!');
