const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { resolveMedia } = require('./services/twitterResolver');
const { convertToSticker, MAX_WHATSAPP_SIZE } = require('./services/converter');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Helper to get active LAN IP addresses
function getNetworkAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        addresses.push({ interface: name, ip: net.address, url: `http://${net.address}:${PORT}` });
      }
    }
  }
  return addresses;
}

// Directories
const PUBLIC_DIR = path.join(__dirname, 'public');
const STICKERS_DIR = path.join(PUBLIC_DIR, 'stickers');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

[PUBLIC_DIR, STICKERS_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer storage for direct file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max upload
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// 1. Extract tweet or video URL
app.post('/api/extract', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid Twitter/X or video URL' });
    }

    const mediaInfo = await resolveMedia(url);
    res.json(mediaInfo);
  } catch (err) {
    console.error('Extraction error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to extract video from tweet' });
  }
});

// 2. Convert to WhatsApp sticker
app.post('/api/convert', upload.single('mediaFile'), async (req, res) => {
  let tempUploadedFile = null;
  try {
    let inputSource = null;

    if (req.file) {
      inputSource = req.file.path;
      tempUploadedFile = req.file.path;
    } else if (req.body.videoUrl) {
      inputSource = req.body.videoUrl;
      // If local relative URL, map to absolute path
      if (inputSource.startsWith('/') && !inputSource.startsWith('//')) {
        inputSource = path.join(PUBLIC_DIR, inputSource);
      }
    } else {
      return res.status(400).json({ error: 'No video source provided (videoUrl or file upload required)' });
    }

    const stickerId = crypto.randomUUID();
    const outputFilename = `${stickerId}.webp`;
    const outputPath = path.join(STICKERS_DIR, outputFilename);

    const startTime = parseFloat(req.body.startTime) || 0;
    const duration = parseFloat(req.body.duration) || 3.5;
    const fps = parseInt(req.body.fps, 10) || 14;
    const quality = parseInt(req.body.quality, 10) || 70;
    const fitMode = req.body.fitMode === 'crop' ? 'crop' : 'fit';
    const speed = parseFloat(req.body.speed) || 1.0;

    let emojis = ['🔥', '✨'];
    if (req.body.emojis) {
      if (Array.isArray(req.body.emojis)) emojis = req.body.emojis;
      else emojis = req.body.emojis.split(/[\s,]+/).filter(Boolean);
    }

    const metadata = {
      packName: req.body.packName || 'Twitter Sticker',
      author: req.body.author || 'Twitter Sticker Maker',
      emojis: emojis.slice(0, 3)
    };

    console.log(`Starting sticker conversion: source=${inputSource.slice(0, 50)}... [${startTime}s - ${startTime + duration}s]`);

    const result = await convertToSticker({
      inputSource,
      outputPath,
      startTime,
      duration,
      fps,
      quality,
      fitMode,
      speed,
      metadata
    });

    const stickerUrl = `/stickers/${outputFilename}`;
    const downloadUrl = `/api/stickers/${stickerId}/download`;
    const packUrl = `/api/stickers/${stickerId}/pack`;

    res.json({
      success: true,
      stickerId,
      url: stickerUrl,
      downloadUrl,
      packUrl,
      sizeBytes: result.sizeBytes,
      sizeKb: result.sizeKb,
      isCompliant: result.isCompliant,
      maxLimitKb: 500,
      dimensions: '512x512',
      metadata
    });
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ error: err.message || 'Sticker conversion failed' });
  } finally {
    // Clean up temporary upload
    if (tempUploadedFile && fs.existsSync(tempUploadedFile)) {
      try {
        fs.unlinkSync(tempUploadedFile);
      } catch (e) {}
    }
  }
});

// 3. Download Sticker endpoint
app.get('/api/stickers/:id/download', (req, res) => {
  const { id } = req.params;
  const stickerPath = path.resolve(STICKERS_DIR, `${id}.webp`);

  if (!fs.existsSync(stickerPath)) {
    return res.status(404).json({ error: 'Sticker not found' });
  }

  const stat = fs.statSync(stickerPath);
  res.writeHead(200, {
    'Content-Type': 'image/webp',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="whatsapp-sticker-${id.slice(0, 8)}.webp"`
  });

  const readStream = fs.createReadStream(stickerPath);
  readStream.pipe(res);
});

// 3.1 Download .wastickers Pack endpoint (for 1-tap WhatsApp mobile import)
app.get('/api/stickers/:id/pack', (req, res) => {
  const { id } = req.params;
  const packPath = path.resolve(STICKERS_DIR, `${id}.wastickers`);

  if (!fs.existsSync(packPath)) {
    return res.status(404).json({ error: 'Sticker pack not found' });
  }

  const stat = fs.statSync(packPath);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="sticker-pack-${id.slice(0, 8)}.wastickers"`
  });

  const readStream = fs.createReadStream(packPath);
  readStream.pipe(res);
});

// 4. Sample clips endpoint
app.get('/api/samples', (req, res) => {
  const samples = [
    {
      id: 'sample-bars',
      title: 'Retro TV Color Bars',
      url: '/samples/sample-bars.mp4',
      badge: 'Test Source',
      author: 'SMPTE Colors'
    },
    {
      id: 'sample-testsrc',
      title: 'Vintage Test Card Loop',
      url: '/samples/sample-testsrc.mp4',
      badge: 'Animated Pattern',
      author: 'Pattern Gen'
    },
    {
      id: 'sample-mandelbrot',
      title: 'Infinite Fractal Zoom',
      url: '/samples/sample-mandelbrot.mp4',
      badge: 'Hypnotic',
      author: 'Mandelbrot Loop'
    },
    {
      id: 'sample-earth',
      title: 'Rotating Planet Earth',
      url: '/samples/sample-earth.gif',
      badge: 'Classic GIF',
      author: 'Wikimedia Commons'
    }
  ];
  res.json({ samples });
});

// Network Info endpoint
app.get('/api/network-info', (req, res) => {
  const addresses = getNetworkAddresses();
  res.json({
    port: PORT,
    localUrl: `http://localhost:${PORT}`,
    networkAddresses: addresses,
    primaryUrl: addresses.length > 0 ? addresses[0].url : `http://localhost:${PORT}`
  });
});

// Cleanup old stickers (older than 2 hours) periodically
setInterval(() => {
  fs.readdir(STICKERS_DIR, (err, files) => {
    if (err || !files) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(STICKERS_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && (now - stats.mtimeMs) > 2 * 60 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 30 * 60 * 1000);

app.listen(PORT, HOST, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 TwitSticker Server is running!`);
  console.log(`--------------------------------------------------`);
  console.log(`• Local:   http://localhost:${PORT}`);
  const addresses = getNetworkAddresses();
  addresses.forEach(addr => {
    console.log(`• Network (${addr.interface}): ${addr.url}`);
  });
  console.log(`==================================================\n`);
});
