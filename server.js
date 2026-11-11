const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
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

// 1.1 Media Proxy endpoint (bypasses Twitter CDN 403 hotlinking block for video/image previews)
app.get('/api/proxy-media', (req, res) => {
  const mediaUrl = req.query.url;
  if (!mediaUrl || typeof mediaUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  let parsed;
  try {
    parsed = new URL(mediaUrl);
  } catch (e) {
    return res.status(400).send('Invalid url');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).send('Invalid protocol');
  }

  const client = parsed.protocol === 'https:' ? https : http;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': '*/*'
  };

  if (parsed.hostname.includes('twimg.com') || parsed.hostname.includes('twitter.com') || parsed.hostname.includes('x.com')) {
    headers['Referer'] = 'https://twitter.com/';
  }

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  const proxyReq = client.request(mediaUrl, { method: 'GET', headers }, proxyRes => {
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      let nextUrl = proxyRes.headers.location;
      if (!nextUrl.startsWith('http')) {
        nextUrl = new URL(nextUrl, mediaUrl).toString();
      }
      return res.redirect(`/api/proxy-media?url=${encodeURIComponent(nextUrl)}`);
    }

    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept',
      'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
      'Accept-Ranges': 'bytes'
    };

    if (proxyRes.headers['content-range']) {
      responseHeaders['Content-Range'] = proxyRes.headers['content-range'];
    }
    if (proxyRes.headers['content-length']) {
      responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
    }

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error('Proxy media error:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Failed to proxy media');
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
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
      // If client passed /api/proxy-media?url=..., extract the real target URL
      if (inputSource.includes('/api/proxy-media?url=')) {
        try {
          const u = new URL(inputSource, 'http://localhost');
          const unwrapped = u.searchParams.get('url');
          if (unwrapped) inputSource = unwrapped;
        } catch (e) {}
      }
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
    const shareUrl = `https://gifsticker.site/sticker/${stickerId}`;

    // Persist sticker metadata for direct link sharing & info lookup
    try {
      const metaFile = path.join(STICKERS_DIR, `${stickerId}.json`);
      fs.writeFileSync(metaFile, JSON.stringify({
        stickerId,
        sizeKb: result.sizeKb,
        sizeBytes: result.sizeBytes,
        isCompliant: result.isCompliant,
        metadata,
        createdAt: Date.now()
      }));
    } catch (metaErr) {
      console.warn('Could not write metadata JSON:', metaErr);
    }

    res.json({
      success: true,
      stickerId,
      url: stickerUrl,
      downloadUrl,
      packUrl,
      shareUrl,
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

// 3.2 Get Sticker Metadata for Shared Link
app.get('/api/stickers/:id/info', (req, res) => {
  const { id } = req.params;
  const stickerPath = path.resolve(STICKERS_DIR, `${id}.webp`);
  if (!fs.existsSync(stickerPath)) {
    return res.status(404).json({ error: 'Sticker not found' });
  }

  const stat = fs.statSync(stickerPath);
  const metaPath = path.resolve(STICKERS_DIR, `${id}.json`);
  let metadata = { packName: 'Twitter Sticker', author: 'TwitSticker', emojis: ['🔥', '✨'] };
  if (fs.existsSync(metaPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (data.metadata) metadata = data.metadata;
    } catch (e) {}
  }

  res.json({
    success: true,
    stickerId: id,
    url: `/stickers/${id}.webp`,
    downloadUrl: `/api/stickers/${id}/download`,
    packUrl: `/api/stickers/${id}/pack`,
    shareUrl: `https://gifsticker.site/sticker/${id}`,
    sizeBytes: stat.size,
    sizeKb: parseFloat((stat.size / 1024).toFixed(1)),
    isCompliant: stat.size <= 500 * 1024,
    metadata
  });
});

// 3.3 Public Shareable Sticker Landing Page (Rich Social Meta & OpenGraph)
app.get(['/sticker/:id', '/s/:id'], (req, res) => {
  const { id } = req.params;
  const stickerPath = path.resolve(STICKERS_DIR, `${id}.webp`);
  if (!fs.existsSync(stickerPath)) {
    return res.redirect('/?notfound=' + encodeURIComponent(id));
  }

  try {
    let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const absoluteStickerUrl = `https://gifsticker.site/stickers/${id}.webp`;
    const shareUrl = `https://gifsticker.site/sticker/${id}`;

    // Read metadata if available
    const metaPath = path.resolve(STICKERS_DIR, `${id}.json`);
    let title = 'WhatsApp Animated Sticker | TwitSticker';
    let desc = 'Check out this animated WhatsApp sticker! Tap to view, download, or add directly to WhatsApp.';
    if (fs.existsSync(metaPath)) {
      try {
        const info = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (info.metadata && info.metadata.packName) {
          title = `${info.metadata.packName} - WhatsApp Sticker`;
        }
      } catch (e) {}
    }

    html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`);
    html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${desc}">`);
    html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${absoluteStickerUrl}">`);
    html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${shareUrl}">`);
    html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`);
    html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${desc}">`);
    html = html.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${absoluteStickerUrl}">`);

    res.send(html);
  } catch (e) {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
});

// 3.2 Download TwitSticker Android App (APK)
app.get(['/download/twitsticker.apk', '/api/app/download'], (req, res) => {
  const apkPath = path.resolve(__dirname, 'android/app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ error: 'TwitSticker APK not found or still compiling.' });
  }
  const stat = fs.statSync(apkPath);
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': stat.size,
    'Content-Disposition': 'attachment; filename="TwitSticker.apk"'
  });
  const readStream = fs.createReadStream(apkPath);
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

// Health Check endpoint
app.get(['/healthz', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
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
