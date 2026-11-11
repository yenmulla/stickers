# TwitSticker 🐦 ➡️ 💬 ✨
### Convert Twitter / X GIFs and Videos to Animated WhatsApp Stickers

A modern, responsive web application that turns Twitter/X GIFs & videos into official, animated WhatsApp stickers adhering to WhatsApp's strict specifications:
- **Exact 512×512 Dimensions**
- **Animated WebP format** with infinite looping
- **Strict < 500 KB limit** with automatic adaptive multi-pass compression
- **WhatsApp EXIF Metadata injection** (Pack Name, Author, Emojis)

---

## 🚀 Quick Start

1. **Install dependencies** (if setting up fresh):
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. Open your browser at:
   ```
   http://localhost:3000
   ```

---

## 🌟 Key Features

1. **Flexible Input Options**:
   - **Twitter / X Links**: Paste any tweet URL (`https://x.com/.../status/...` or `https://twitter.com/.../status/...`).
   - **Direct Video Links**: Supports `.mp4`, `.gif`, `.webm`, or Twitter CDN `video.twimg.com` links.
   - **Direct File Upload**: Drag & drop any local GIF, MP4, WebM, or MOV file.
   - **Interactive Presets**: One-click sample clips to test immediately.

2. **Interactive Sticker Studio**:
   - **Live 512×512 Preview** with synchronized loop playback.
   - **WhatsApp Chat Simulation**: Toggle between *Transparent checkerboard*, *WhatsApp Dark Mode chat*, and *WhatsApp Light Mode chat* with realistic message bubble, timestamp, and blue checkmarks.
   - **Precision Trimming**: Start time and duration sliders (recommended 2s–3.5s).
   - **Fit / Framing Modes**:
     - *Fit with Transparency*: Preserves full aspect ratio with transparent borders.
     - *Square Crop (Fill)*: Fills the entire 512×512 canvas.
   - **Speed Adjustment**: 0.75x, 1.0x, 1.25x, 1.5x.
   - **Frame Rate Optimization**: 10 fps, 14 fps (Standard Recommended), 16 fps.
   - **WhatsApp EXIF Metadata**: Custom Pack Name, Author/Publisher handle, and associated emojis embedded into the WebP file.

3. **Guaranteed WhatsApp Compliance (< 500 KB)**:
   - Built-in multi-pass compression engine ensures that even complex, high-motion animations are optimized to never exceed WhatsApp's 500 KB sticker ceiling.

4. **Multiple Export & Share Methods**:
   - **Direct `.webp` Download**: One-click download.
   - **WhatsApp Web / Desktop Drag & Drop**: Simply drag the downloaded `.webp` directly into any WhatsApp Web chat, hit send, and right-click &rarr; *Add to Favorites*.
   - **Scan for Phone (QR Code)**: Generates an on-screen QR code so you can point your mobile camera and open/save the sticker directly on iOS or Android.
   - **Web Share / Deep Link**: Native mobile share sheet integration.
   - **Recent Stickers Gallery**: Locally saved sticker history drawer for quick re-downloading.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, `ffmpeg-static`, `multer`, `yt-dlp`
- **Frontend**: Vanilla JavaScript (ES6+), Tailwind CSS, Lucide Icons, QRCode.js
- **Processing**: Embedded FFmpeg with custom RIFF EXIF metadata injection

