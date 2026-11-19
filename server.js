const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Load local .env file automatically if present (without overriding existing OS env vars)
(function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.warn('[Env] Could not parse .env file:', e.message);
  }
})();

const { resolveMedia } = require('./services/twitterResolver');
const { convertToSticker, MAX_WHATSAPP_SIZE } = require('./services/converter');
const { SEO_SLUGS, renderSeoPage, renderSharedStickerPage } = require('./services/seoPages');
const {
  getPublicConfig,
  optionalAuth,
  requireAuth,
  handleGetMe,
  handlePaystackInitialize,
  handlePaystackVerify,
  handlePaystackManageLink,
  handlePaystackWebhook
} = require('./services/authAndBilling');

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

// Paystack Webhook MUST be mounted before express.json() to receive raw payload for HMAC-SHA512 verification
app.post('/api/billing/paystack/webhook', express.raw({ type: 'application/json' }), handlePaystackWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(optionalAuth);

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
    'Content-Disposition': 'attachment; filename="TwitSticker-v1.0.4.apk"',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  const readStream = fs.createReadStream(apkPath);
  readStream.pipe(res);
});

// Baseline security & SEO headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else if (/\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    } else if (/\.(css|js|webmanifest)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    }
  }
}));

// Dedicated Server-Rendered SEO Landing Pages (canonical non-trailing-slash routes)
const seoRoutePaths = SEO_SLUGS.map(slug => `/${slug}`);
app.get(seoRoutePaths, (req, res) => {
  // Redirect trailing slash to canonical URL (301 Permanent)
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, req.path.slice(0, -1) + query);
  }
  const slug = req.path.replace(/^\/+|\/+$/g, '');
  try {
    const baseHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const rendered = renderSeoPage(baseHtml, slug);
    if (!rendered) return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return res.send(rendered);
  } catch (e) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
});

// In-memory sliding rate limiter (tier-aware: Pro users get higher limits)
const ipRequestCounts = new Map();
function rateLimit({ windowMs, max, proMax, message }) {
  return (req, res, next) => {
    const isPro = Boolean(req.user && req.user.isPro);
    const effectiveMax = isPro && proMax ? proMax : max;
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const key = req.user ? `uid:${req.user.uid}` : `ip:${ip}`;
    const now = Date.now();
    let record = ipRequestCounts.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      ipRequestCounts.set(key, record);
    }
    record.count++;
    if (record.count > effectiveMax) {
      const waitSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.set('Retry-After', String(waitSec));
      return res.status(429).json({
        error: message || `Too many requests. Please wait ${waitSec} seconds.`,
        isPro
      });
    }
    next();
  };
}

// Daily free sticker quota (Free: 4 stickers/day, Pro: unlimited)
const FREE_DAILY_STICKER_LIMIT = Math.max(1, parseInt(process.env.FREE_DAILY_LIMIT || '4', 10));
const dailyStickerUsage = new Map(); // key -> { date: 'YYYY-MM-DD', count: number }

function getUtcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getNextUtcMidnightIso() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return next.toISOString();
}

function getQuotaKeys(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const keys = [`ip:${ip}`];
  if (req.user && req.user.uid) {
    keys.push(`uid:${req.user.uid}`);
  }
  return keys;
}

function getDailyQuotaStatus(req) {
  const isPro = Boolean(req.user && req.user.isPro);
  const today = getUtcDateKey();
  if (isPro) {
    return {
      isPro: true,
      limit: null,
      used: 0,
      remaining: null,
      date: today,
      resetsAt: getNextUtcMidnightIso()
    };
  }
  const keys = getQuotaKeys(req);
  let used = 0;
  for (const key of keys) {
    const rec = dailyStickerUsage.get(key);
    if (rec && rec.date === today && rec.count > used) {
      used = rec.count;
    }
  }
  return {
    isPro: false,
    limit: FREE_DAILY_STICKER_LIMIT,
    used,
    remaining: Math.max(0, FREE_DAILY_STICKER_LIMIT - used),
    date: today,
    resetsAt: getNextUtcMidnightIso()
  };
}

function incrementDailyUsage(req) {
  if (req.user && req.user.isPro) return getDailyQuotaStatus(req);
  const today = getUtcDateKey();
  const keys = getQuotaKeys(req);
  for (const key of keys) {
    const rec = dailyStickerUsage.get(key);
    if (!rec || rec.date !== today) {
      dailyStickerUsage.set(key, { date: today, count: 1 });
    } else {
      rec.count += 1;
    }
  }
  return getDailyQuotaStatus(req);
}

// Memory leak safeguard: sweep rate limiter & stale daily quota records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestCounts.entries()) {
    if (now > record.resetTime) ipRequestCounts.delete(ip);
  }
  const today = getUtcDateKey();
  for (const [key, rec] of dailyStickerUsage.entries()) {
    if (rec.date !== today) dailyStickerUsage.delete(key);
  }
}, 5 * 60 * 1000);

// Priority single-worker conversion queue (Pro users jump ahead of free jobs)
class ConversionQueue {
  constructor(maxConcurrent = 1, maxQueueLength = 25) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueLength = maxQueueLength;
    this.running = 0;
    this.queue = [];
  }

  enqueue(taskFn, { priority = 0 } = {}) {
    const limit = priority > 0 ? this.maxQueueLength + 15 : this.maxQueueLength;
    if (this.queue.length >= limit) {
      const err = new Error('High server load: conversion queue is full. Please try again in 10-15 seconds.');
      err.status = 429;
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      const entry = { taskFn, resolve, reject, priority };
      if (priority > 0) {
        // Insert after any existing higher/equal priority jobs, ahead of standard free jobs
        const insertIdx = this.queue.findIndex(item => item.priority < priority);
        if (insertIdx === -1) {
          this.queue.push(entry);
        } else {
          this.queue.splice(insertIdx, 0, entry);
        }
      } else {
        this.queue.push(entry);
      }
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
    return {
      running: this.running,
      queued: this.queue.length,
      proQueued: this.queue.filter(q => q.priority > 0).length
    };
  }
}

const conversionQueue = new ConversionQueue(1, 25);

// Map to coordinate in-flight conversions (Single-Flight Pattern)
// Prevents duplicate concurrent conversions of the exact same video
const inFlightConversions = new Map();

/**
 * Computes a deterministic cache identifier based on the source media and conversion parameters.
 * If two requests ask for the same video with the same trim/fps/fit/effects, they yield identical IDs.
 */
function computeStickerCacheId({
  inputKey, startTime, duration, fps, quality, fitMode, speed,
  loopMode, borderStyle, overlayText, textPosition, textColor, metadata
}) {
  const norm = [
    inputKey.trim(),
    Number(startTime || 0).toFixed(2),
    Number(duration || 3.5).toFixed(2),
    parseInt(fps || 14, 10),
    parseInt(quality || 70, 10),
    fitMode === 'crop' ? 'crop' : 'fit',
    Number(speed || 1.0).toFixed(2),
    loopMode || 'normal',
    borderStyle || 'none',
    (overlayText || '').trim(),
    textPosition || 'bottom',
    textColor || 'white',
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

// 0. Public Auth & Billing Config (exposes only public Firebase Web SDK config & Paystack plan tiers)
app.get('/api/config/public', (req, res) => {
  res.json({
    ...getPublicConfig(),
    freeDailyLimit: FREE_DAILY_STICKER_LIMIT
  });
});

// Quota: Return remaining daily free sticker generations (or unlimited for Pro)
app.get('/api/quota', (req, res) => {
  res.json(getDailyQuotaStatus(req));
});

// Auth: Return fresh user profile + Pro status from Firebase Admin
app.get('/api/auth/me', requireAuth, handleGetMe);

// Billing (Paystack): Initialize hosted Checkout / Subscription for 1 Month / 6 Months / 1 Year Pro
app.post('/api/billing/paystack/initialize', rateLimit({ windowMs: 60 * 1000, max: 15, proMax: 30, message: 'Too many checkout requests. Please wait a minute.' }), requireAuth, handlePaystackInitialize);

// Billing (Paystack): Verify transaction immediately upon redirect back from Paystack
app.post('/api/billing/paystack/verify', requireAuth, handlePaystackVerify);

// Billing (Paystack): Generate hosted subscription management link
app.post('/api/billing/paystack/manage-link', requireAuth, handlePaystackManageLink);

// 1. Extract GIF, video, or social post URL
app.post('/api/extract', rateLimit({ windowMs: 60 * 1000, max: 30, proMax: 120, message: 'Too many extraction requests. Please wait a moment.' }), async (req, res) => {
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
app.post('/api/convert', rateLimit({ windowMs: 60 * 1000, max: 15, proMax: 60, message: 'Too many conversion requests. Please wait a moment.' }), upload.single('mediaFile'), async (req, res) => {
  let tempUploadedFile = null;
  try {
    const isPro = Boolean(req.user && req.user.isPro);

    // Enforce daily free sticker limit (4/day for Free, unlimited for Pro)
    if (!isPro) {
      const quota = getDailyQuotaStatus(req);
      if (quota.remaining <= 0) {
        return res.status(429).json({
          error: `You've used all ${FREE_DAILY_STICKER_LIMIT} free stickers for today. Upgrade to TwitSticker Pro for unlimited stickers!`,
          code: 'DAILY_LIMIT_REACHED',
          quota
        });
      }
    }

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

    const startTime = Math.max(0, parseFloat(req.body.startTime) || 0);
    const maxAllowedDuration = isPro ? 6.0 : 3.5;
    const requestedDuration = parseFloat(req.body.duration) || 3.0;
    const duration = Math.min(Math.max(0.5, requestedDuration), maxAllowedDuration);

    const maxAllowedFps = isPro ? 20 : 14;
    const requestedFps = parseInt(req.body.fps, 10) || 14;
    const fps = Math.min(Math.max(8, requestedFps), maxAllowedFps);

    const quality = parseInt(req.body.quality, 10) || (isPro ? 78 : 70);
    const fitMode = req.body.fitMode === 'crop' ? 'crop' : 'fit';
    const speed = parseFloat(req.body.speed) || 1.0;

    // Pro Creative Effects
    const allowedLoops = ['normal', 'reverse', 'boomerang'];
    const requestedLoop = allowedLoops.includes(req.body.loopMode) ? req.body.loopMode : 'normal';
    const allowedBorders = ['none', 'white', 'rounded', 'circle'];
    const requestedBorder = allowedBorders.includes(req.body.borderStyle) ? req.body.borderStyle : 'none';
    const requestedOverlayText = String(req.body.overlayText || '').trim().slice(0, 60);
    const allowedPositions = ['top', 'center', 'bottom'];
    const textPosition = allowedPositions.includes(req.body.textPosition) ? req.body.textPosition : 'bottom';
    const allowedColors = ['white', 'yellow', 'green', 'pink'];
    const textColor = allowedColors.includes(req.body.textColor) ? req.body.textColor : 'white';

    const usesProEffects =
      requestedLoop !== 'normal' ||
      requestedBorder !== 'none' ||
      requestedOverlayText.length > 0;

    if (usesProEffects && !isPro) {
      return res.status(403).json({
        error: 'Creative studio effects (text overlays, borders, boomerang/reverse) require TwitSticker Pro.',
        code: 'PRO_REQUIRED'
      });
    }

    const loopMode = isPro ? requestedLoop : 'normal';
    const borderStyle = isPro ? requestedBorder : 'none';
    const overlayText = isPro ? requestedOverlayText : '';

    let emojis = ['🔥', '✨'];
    if (req.body.emojis) {
      if (Array.isArray(req.body.emojis)) emojis = req.body.emojis;
      else emojis = req.body.emojis.split(/[\s,]+/).filter(Boolean);
    }

    // Custom EXIF pack name & author are Pro-only; free users get default TwitSticker branding
    const metadata = {
      packName: isPro ? ((req.body.packName || '').trim() || 'TwitSticker') : 'TwitSticker',
      author: isPro ? ((req.body.author || '').trim() || 'gifsticker.site') : 'gifsticker.site',
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
      loopMode,
      borderStyle,
      overlayText,
      textPosition,
      textColor,
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
          const quota = incrementDailyUsage(req);
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
            metadata,
            quota
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
      const quota = incrementDailyUsage(req);
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
        metadata,
        quota
      });
    }

    // 3. EXECUTE CONVERSION: Enqueue task (Pro users get priority lane)
    const qStatus = conversionQueue.getStatus();
    console.log(`Starting sticker conversion [${isPro ? 'PRO' : 'FREE'}]: source=${inputSource.slice(0, 50)}... [${startTime}s - ${startTime + duration}s] (queue: ${qStatus.queued} waiting)`);

    const conversionPromise = conversionQueue.enqueue(() => convertToSticker({
      inputSource,
      outputPath,
      startTime,
      duration,
      fps,
      quality,
      fitMode,
      speed,
      loopMode,
      borderStyle,
      overlayText,
      textPosition,
      textColor,
      isPro,
      metadata
    }), { priority: isPro ? 1 : 0 });

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

    const quota = incrementDailyUsage(req);

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
      metadata,
      quota
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
    const baseHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
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
          title = `${info.metadata.packName} - WhatsApp Sticker | TwitSticker`;
        }
      } catch (e) {}
    }

    const html = renderSharedStickerPage(baseHtml, {
      title,
      desc,
      absoluteStickerUrl,
      shareUrl
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_WEB_PROJECT_ID || 'app-92db9b7e';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || '';
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
