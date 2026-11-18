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

// Serve signed Release APK before express.static so /download/twitsticker.apk is never shadowed or browser-cached
app.get(['/download/twitsticker.apk', '/api/app/download'], (req, res) => {
  const releaseApkPath = path.resolve(__dirname, 'android/app/build/outputs/apk/release/app-release.apk');
  const bundledPublicApkPath = path.resolve(PUBLIC_DIR, 'download/twitsticker.apk');
  const apkPath = fs.existsSync(releaseApkPath) ? releaseApkPath : bundledPublicApkPath;

  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ error: 'TwitSticker Release APK not found or still compiling.' });
  }
  const stat = fs.statSync(apkPath);
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': stat.size,
    'Content-Disposition': 'attachment; filename="TwitSticker-v1.0.3.apk"',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  const readStream = fs.createReadStream(apkPath);
  readStream.pipe(res);
});

app.use(express.static(PUBLIC_DIR));

// In-memory sliding rate limiter to prevent abuse during traffic spikes
const ipRequestCounts = new Map();
function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = ipRequestCounts.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      ipRequestCounts.set(ip, record);
    }
    record.count++;
    if (record.count > max) {
      const waitSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.set('Retry-After', String(waitSec));
      return res.status(429).json({ error: message || `Too many requests. Please wait ${waitSec} seconds.` });
    }
    next();
  };
}

// Memory leak safeguard: sweep rate limiter records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestCounts.entries()) {
    if (now > record.resetTime) ipRequestCounts.delete(ip);
  }
}, 5 * 60 * 1000);

// Single-worker conversion queue to strictly limit concurrent FFmpeg processes on low-RAM containers
class ConversionQueue {
  constructor(maxConcurrent = 1, maxQueueLength = 25) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueLength = maxQueueLength;
    this.running = 0;
    this.queue = [];
  }

  enqueue(taskFn) {
    if (this.queue.length >= this.maxQueueLength) {
      const err = new Error('High server load: conversion queue is full. Please try again in 10-15 seconds.');
      err.status = 429;
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.dequeue();
    });
  }

  dequeue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    this.running++;
    const { taskFn, resolve, reject } = this.queue.shift();
    taskFn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running--;
        this.dequeue();
      });
  }

  getStatus() {
    return { running: this.running, queued: this.queue.length };
  }
}

const conversionQueue = new ConversionQueue(1, 25);

// Map to coordinate in-flight conversions (Single-Flight Pattern)
// Prevents duplicate concurrent conversions of the exact same video
const inFlightConversions = new Map();

/**
 * Computes a deterministic cache identifier based on the source media and conversion parameters.
 * If two requests ask for the same video with the same trim/fps/fit, they yield identical IDs.
 */
function computeStickerCacheId({ inputKey, startTime, duration, fps, quality, fitMode, speed, metadata }) {
  const norm = [
    inputKey.trim(),
    Number(startTime || 0).toFixed(2),
    Number(duration || 3.5).toFixed(2),
    parseInt(fps || 14, 10),
    parseInt(quality || 70, 10),
    fitMode === 'crop' ? 'crop' : 'fit',
    Number(speed || 1.0).toFixed(2),
    (metadata.packName || 'TwitSticker').trim(),
    (metadata.author || 'gifsticker.site').trim(),
    ((metadata.emojis || ['🔥', '✨'])).slice(0, 3).sort().join(',')
  ].join('|');

  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 24);
}

/**
 * Updates mtime/atime of cached files to keep them alive in LRU cache
 */
function touchCachedFiles(stickerId) {
  const now = new Date();
  ['.webp', '.wastickers', '.json'].forEach(ext => {
    const f = path.join(STICKERS_DIR, `${stickerId}${ext}`);
    if (fs.existsSync(f)) {
      try { fs.utimesSync(f, now, now); } catch (e) {}
    }
  });
}

// 1. Extract GIF, video, or social post URL
app.post('/api/extract', rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many extraction requests. Please wait a moment.' }), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid GIF, video, or post URL' });
    }

    const mediaInfo = await resolveMedia(url);
    res.json(mediaInfo);
  } catch (err) {
    console.error('Extraction error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to extract GIF or video from link' });
  }
});

// 1.1 Media Proxy endpoint (bypasses CDN 403 hotlinking blocks for video/GIF previews)
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
  const isTwitterCdn = parsed.hostname.includes('twimg.com') || parsed.hostname.includes('twitter.com') || parsed.hostname.includes('x.com');

  function makeProxyRequest(attemptMode = 'default') {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/gif,video/*,*/*;q=0.8'
    };

    if (attemptMode === 'default' && isTwitterCdn) {
      headers['Referer'] = 'https://twitter.com/';
    } else if (attemptMode === 'alternate' && !isTwitterCdn) {
      headers['Referer'] = `${parsed.origin}/`;
    }

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const proxyReq = client.request(mediaUrl, { method: 'GET', headers }, proxyRes => {
      // Follow redirects
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        let nextUrl = proxyRes.headers.location;
        if (!nextUrl.startsWith('http')) {
          nextUrl = new URL(nextUrl, mediaUrl).toString();
        }
        return res.redirect(`/api/proxy-media?url=${encodeURIComponent(nextUrl)}`);
      }

      // Retry with alternate Referer if 403 Forbidden
      if (proxyRes.statusCode === 403 && attemptMode === 'default') {
        proxyRes.resume();
        return makeProxyRequest('alternate');
      }

      const fallbackType = /\.gif(\?|$)/i.test(mediaUrl)
        ? 'image/gif'
        : (/\.webp(\?|$)/i.test(mediaUrl) ? 'image/webp' : 'video/mp4');

      const responseHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Origin, Content-Type, Accept',
        'Content-Type': proxyRes.headers['content-type'] || fallbackType,
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
      // Quietly ignore normal client aborts / socket resets
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message?.includes('socket hang up') || err.message?.includes('premature close')) {
        return;
      }
      console.warn('Proxy media notice:', err.message);
      if (!res.headersSent) {
        res.status(502).send('Failed to proxy media');
      }
    });

    req.on('close', () => {
      try { proxyReq.destroy(); } catch (e) {}
    });

    proxyReq.end();
  }

  makeProxyRequest('default');
});

// 2. Convert to WhatsApp sticker
app.post('/api/convert', rateLimit({ windowMs: 60 * 1000, max: 15, message: 'Too many conversion requests. Please wait a moment.' }), upload.single('mediaFile'), async (req, res) => {
  let tempUploadedFile = null;
  try {
    let inputSource = null;
    let inputKey = null;

    if (req.file) {
      inputSource = req.file.path;
      tempUploadedFile = req.file.path;
      try {
        const fileBuf = fs.readFileSync(req.file.path);
        inputKey = 'upload_' + crypto.createHash('sha256').update(fileBuf).digest('hex').slice(0, 20);
      } catch (e) {
        inputKey = 'upload_' + Date.now();
      }
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
      inputKey = inputSource;
    } else {
      return res.status(400).json({ error: 'No video source provided (videoUrl or file upload required)' });
    }

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
      packName: req.body.packName || 'TwitSticker',
      author: req.body.author || 'gifsticker.site',
      emojis: emojis.slice(0, 3)
    };

    // Compute deterministic cache key / sticker ID
    const stickerId = computeStickerCacheId({
      inputKey,
      startTime,
      duration,
      fps,
      quality,
      fitMode,
      speed,
      metadata
    });

    const outputFilename = `${stickerId}.webp`;
    const outputPath = path.join(STICKERS_DIR, outputFilename);
    const packPath = path.join(STICKERS_DIR, `${stickerId}.wastickers`);
    const metaFile = path.join(STICKERS_DIR, `${stickerId}.json`);

    const stickerUrl = `/stickers/${outputFilename}`;
    const downloadUrl = `/api/stickers/${stickerId}/download`;
    const packUrl = `/api/stickers/${stickerId}/pack`;
    const shareUrl = `https://gifsticker.site/sticker/${stickerId}`;

    // 1. FAST PATH: Server-Side Cache Hit (Instant response, zero FFmpeg/CPU)
    if (fs.existsSync(outputPath) && fs.existsSync(packPath)) {
      try {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1000) {
          touchCachedFiles(stickerId);
          console.log(`[CACHE HIT] Delivering cached sticker ${stickerId} for ${inputKey.slice(0, 50)}...`);
          return res.json({
            success: true,
            cached: true,
            stickerId,
            url: stickerUrl,
            downloadUrl,
            packUrl,
            shareUrl,
            sizeBytes: stat.size,
            sizeKb: parseFloat((stat.size / 1024).toFixed(1)),
            isCompliant: stat.size <= 500 * 1024,
            maxLimitKb: 500,
            dimensions: '512x512',
            metadata
          });
        }
      } catch (cacheErr) {
        console.warn('Cache verification notice:', cacheErr.message);
      }
    }

    // 2. IN-FLIGHT DEDUPLICATION: Join existing active conversion if already running
    if (inFlightConversions.has(stickerId)) {
      console.log(`[IN-FLIGHT JOIN] Joining active conversion for sticker ${stickerId}`);
      const result = await inFlightConversions.get(stickerId);
      touchCachedFiles(stickerId);
      return res.json({
        success: true,
        cached: true,
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
    }

    // 3. EXECUTE CONVERSION: Enqueue task
    const qStatus = conversionQueue.getStatus();
    console.log(`Starting sticker conversion: source=${inputSource.slice(0, 50)}... [${startTime}s - ${startTime + duration}s] (queue: ${qStatus.queued} waiting)`);

    const conversionPromise = conversionQueue.enqueue(() => convertToSticker({
      inputSource,
      outputPath,
      startTime,
      duration,
      fps,
      quality,
      fitMode,
      speed,
      metadata
    }));

    inFlightConversions.set(stickerId, conversionPromise);

    let result;
    try {
      result = await conversionPromise;
    } finally {
      inFlightConversions.delete(stickerId);
    }

    // Persist sticker metadata for direct link sharing & info lookup
    try {
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
      cached: false,
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
    if (err.status === 429) {
      res.set('Retry-After', '10');
      return res.status(429).json({ error: err.message });
    }
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

  touchCachedFiles(id);
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

  touchCachedFiles(id);
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

  touchCachedFiles(id);
  const stat = fs.statSync(stickerPath);
  const metaPath = path.resolve(STICKERS_DIR, `${id}.json`);
  let metadata = { packName: 'TwitSticker', author: 'gifsticker.site', emojis: ['🔥', '✨'] };
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

  touchCachedFiles(id);
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

// 5. Play Store Closed Alpha Tester Email Signup (writes to Firestore + local JSON backup)
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'app-92db9b7e';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAKruh-12KoN4O2Qdn_3huLFE5D9lxgxjU';
const ALPHA_TESTERS_FILE = path.join(__dirname, 'alpha-testers.json');

function saveAlphaTesterLocal(entry) {
  let list = [];
  try {
    if (fs.existsSync(ALPHA_TESTERS_FILE)) {
      list = JSON.parse(fs.readFileSync(ALPHA_TESTERS_FILE, 'utf8'));
      if (!Array.isArray(list)) list = [];
    }
  } catch (e) {
    list = [];
  }
  const existingIdx = list.findIndex(item => item.email === entry.email);
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...entry, updatedAt: new Date().toISOString() };
  } else {
    list.push(entry);
  }
  fs.writeFileSync(ALPHA_TESTERS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function writeAlphaTesterToFirestore(entry) {
  return new Promise((resolve) => {
    const docId = entry.email.replace(/[^a-z0-9@._-]/gi, '_').slice(0, 120);
    const payload = JSON.stringify({
      fields: {
        email: { stringValue: entry.email },
        status: { stringValue: 'pending' },
        source: { stringValue: entry.source || 'website_popup' },
        createdAt: { timestampValue: entry.createdAt }
      }
    });

    const req = https.request(
      {
        hostname: 'firestore.googleapis.com',
        path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/alpha_testers/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      },
      (res) => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body });
        });
      }
    );

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.write(payload);
    req.end();
  });
}

app.post('/api/alpha-signup', rateLimit({ windowMs: 60 * 1000, max: 15, message: 'Too many signup requests. Please wait a minute.' }), async (req, res) => {
  try {
    const rawEmail = (req.body && req.body.email ? String(req.body.email) : '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail)) {
      return res.status(400).json({ error: 'Please provide a valid Google Play Store email address.' });
    }

    const entry = {
      email: rawEmail,
      status: 'pending',
      source: (req.body && req.body.source ? String(req.body.source) : 'website_popup').slice(0, 100),
      createdAt: new Date().toISOString()
    };

    // Persist locally as guaranteed backup
    saveAlphaTesterLocal(entry);

    // Write to Cloud Firestore if not already saved by client
    let firestoreResult = { ok: Boolean(req.body && req.body.clientFirestoreSaved), via: 'client' };
    if (!firestoreResult.ok) {
      firestoreResult = await writeAlphaTesterToFirestore(entry);
    }

    return res.json({
      success: true,
      email: rawEmail,
      storedInFirestore: Boolean(firestoreResult.ok),
      firestoreStatus: firestoreResult.status || null,
      officialSender: 'updates@gifsticker.site'
    });
  } catch (err) {
    console.error('[AlphaSignup] Error:', err);
    return res.status(500).json({ error: 'Failed to save alpha tester email.' });
  }
});

// Health Check endpoint with memory & queue stats for monitoring
app.get(['/healthz', '/api/health'], (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    queue: conversionQueue.getStatus(),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024)
    },
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

// Cleanup old stickers and temporary uploads periodically (every 5 minutes)
function cleanDirectory(dir, maxAgeMs) {
  if (!fs.existsSync(dir)) return;
  fs.readdir(dir, (err, files) => {
    if (err || !files) return;
    const now = Date.now();
    files.forEach(file => {
      if (file === '.gitkeep') return;
      const filePath = path.join(dir, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && (now - stats.mtimeMs) > maxAgeMs) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}

setInterval(() => {
  // Clean sticker cache older than 2 hours of inactivity (LRU)
  cleanDirectory(STICKERS_DIR, 2 * 60 * 60 * 1000);
  // Clean temporary uploads older than 15 minutes
  cleanDirectory(UPLOADS_DIR, 15 * 60 * 1000);
}, 5 * 60 * 1000);

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
