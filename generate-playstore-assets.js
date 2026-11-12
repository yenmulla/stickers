const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname, 'playstore');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Convert local logo to base64 for embedding in SVGs
const logoPngBuffer = fs.readFileSync(path.join(__dirname, 'public', 'logo.png'));
const logoPngBase64 = `data:image/png;base64,${logoPngBuffer.toString('base64')}`;

async function generateAppIcon() {
  console.log('Generating 512x512 App Icon...');
  const iconPath = path.join(outDir, 'icon-512.png');
  await sharp(logoPngBuffer)
    .resize(512, 512, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(iconPath);
  console.log('✓ Generated:', iconPath);
}

async function generateFeatureGraphic() {
  console.log('Generating 1024x500 Feature Graphic...');
  const svg = `
  <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0f1d" />
        <stop offset="40%" stop-color="#0b1329" />
        <stop offset="100%" stop-color="#030712" />
      </linearGradient>

      <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="50%" stop-color="#0ea5e9" />
        <stop offset="100%" stop-color="#25D366" />
      </linearGradient>

      <linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#25D366" />
        <stop offset="100%" stop-color="#128C7E" />
      </linearGradient>

      <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" stop-opacity="0.8" />
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0.9" />
      </linearGradient>

      <radialGradient id="cyanGlow" cx="20%" cy="40%" r="50%">
        <stop offset="0%" stop-color="#0284c7" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#0284c7" stop-opacity="0" />
      </radialGradient>

      <radialGradient id="greenGlow" cx="80%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#25D366" stop-opacity="0.2" />
        <stop offset="100%" stop-color="#25D366" stop-opacity="0" />
      </radialGradient>

      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6" />
      </filter>

      <filter id="glowSubtle" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#25D366" flood-opacity="0.4" />
      </filter>
    </defs>

    <!-- Background -->
    <rect width="1024" height="500" fill="url(#bgGrad)" />
    <rect width="1024" height="500" fill="url(#cyanGlow)" />
    <rect width="1024" height="500" fill="url(#greenGlow)" />

    <!-- Grid / Tech Pattern Accent -->
    <g opacity="0.04" stroke="#ffffff" stroke-width="1">
      <line x1="0" y1="100" x2="1024" y2="100" />
      <line x1="0" y1="200" x2="1024" y2="200" />
      <line x1="0" y1="300" x2="1024" y2="300" />
      <line x1="0" y1="400" x2="1024" y2="400" />
      <line x1="200" y1="0" x2="200" y2="500" />
      <line x1="400" y1="0" x2="400" y2="500" />
      <line x1="600" y1="0" x2="600" y2="500" />
      <line x1="800" y1="0" x2="800" y2="500" />
    </g>

    <!-- LEFT COLUMN: Branding & Text -->
    <g transform="translate(60, 60)">
      <!-- Top Pill Badge -->
      <rect x="0" y="0" width="220" height="34" rx="17" fill="#1e293b" stroke="#334155" stroke-width="1" />
      <circle cx="18" cy="17" r="5" fill="#25D366" />
      <text x="32" y="22" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="12" font-weight="700" fill="#38bdf8" letter-spacing="1">WASTICKER COMPLIANT</text>

      <!-- App Logo + Title row -->
      <g transform="translate(0, 50)">
        <image href="${logoPngBase64}" x="0" y="0" width="68" height="68" rx="18" filter="url(#shadow)" />
        <text x="86" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="-1">TwitSticker</text>
        <text x="326" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="34" font-weight="900" fill="#25D366">.app</text>
      </g>

      <!-- Main Headline -->
      <g transform="translate(0, 145)">
        <text x="0" y="0" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="32" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
          Twitter / X Videos &amp; GIFs
        </text>
        <text x="0" y="40" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="32" font-weight="800" fill="url(#primaryGrad)" letter-spacing="-0.5">
          ➡️ Animated WhatsApp Stickers
        </text>
      </g>

      <!-- Feature Tags Row -->
      <g transform="translate(0, 260)">
        <!-- Tag 1 -->
        <rect x="0" y="0" width="135" height="36" rx="18" fill="#1e293b" stroke="#334155" stroke-width="1" />
        <text x="67" y="23" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="13" font-weight="600" fill="#cbd5e1" text-anchor="middle">⚡ &lt; 500 KB Limit</text>

        <!-- Tag 2 -->
        <rect x="145" y="0" width="145" height="36" rx="18" fill="#1e293b" stroke="#334155" stroke-width="1" />
        <text x="217" y="23" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="13" font-weight="600" fill="#cbd5e1" text-anchor="middle">✂️ Precision Trim</text>

        <!-- Tag 3 -->
        <rect x="300" y="0" width="150" height="36" rx="18" fill="#1e293b" stroke="#334155" stroke-width="1" />
        <text x="375" y="23" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="13" font-weight="600" fill="#cbd5e1" text-anchor="middle">💬 Live Chat View</text>
      </g>

      <!-- CTA Button Row -->
      <g transform="translate(0, 325)">
        <rect x="0" y="0" width="220" height="46" rx="23" fill="url(#btnGrad)" filter="url(#glowSubtle)" />
        <text x="110" y="29" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">ADD TO WHATSAPP</text>
        <circle cx="196" cy="23" r="10" fill="#ffffff" fill-opacity="0.25" />
        <text x="196" y="28" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">✓</text>
      </g>
    </g>

    <!-- RIGHT COLUMN: Modern Floating Device / Sticker Studio Mockup -->
    <g transform="translate(630, 45)">
      <!-- Main Phone Mockup Frame -->
      <rect x="0" y="0" width="330" height="420" rx="36" fill="#0f172a" stroke="#334155" stroke-width="3" filter="url(#shadow)" />
      
      <!-- Inner Screen Background -->
      <rect x="12" y="12" width="306" height="396" rx="26" fill="#075e54" />
      
      <!-- WhatsApp Header -->
      <rect x="12" y="12" width="306" height="52" rx="26" fill="#128c7e" />
      <circle cx="44" cy="38" r="15" fill="#25D366" />
      <text x="44" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">💬</text>
      <text x="68" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14" font-weight="700" fill="#ffffff">WhatsApp Chat</text>
      <text x="68" y="48" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="10" font-weight="400" fill="#d1fae5">online</text>

      <!-- Chat Bubble Container -->
      <rect x="12" y="64" width="306" height="344" rx="0" fill="#0b141a" />
      
      <!-- Received text bubble -->
      <rect x="26" y="80" width="180" height="36" rx="10" fill="#202c33" />
      <text x="38" y="103" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="12" fill="#e9edef">Did you see that X clip?! 🤣</text>
      
      <!-- Sticker Bubble (Sent) -->
      <g transform="translate(70, 130)">
        <rect x="0" y="0" width="220" height="200" rx="16" fill="#005c4b" stroke="#056162" stroke-width="1" filter="url(#shadow)" />
        
        <!-- Sticker Artwork -->
        <rect x="12" y="12" width="196" height="150" rx="12" fill="#0f172a" />
        <image href="${logoPngBase64}" x="35" y="12" width="150" height="150" />
        
        <!-- Animated Badge on Sticker -->
        <rect x="20" y="20" width="68" height="20" rx="6" fill="#000000" fill-opacity="0.65" />
        <text x="54" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="10" font-weight="700" fill="#25D366" text-anchor="middle">ANIMATED</text>
        
        <!-- Bubble metadata -->
        <text x="175" y="186" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="11" fill="#8696a0">12:45</text>
        <!-- WhatsApp double checkmark -->
        <text x="202" y="186" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="11" fill="#53bdeb">✓✓</text>
      </g>

      <!-- Bottom Chat Bar -->
      <rect x="22" y="348" width="230" height="40" rx="20" fill="#2a3942" />
      <text x="40" y="373" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="13" fill="#8696a0">Message...</text>
      <circle cx="282" cy="368" r="18" fill="#00a884" />
      <text x="282" y="373" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14" fill="#ffffff" text-anchor="middle">🎤</text>
    </g>
  </svg>
  `;

  const graphicPath = path.join(outDir, 'feature-graphic.png');
  await sharp(Buffer.from(svg))
    .resize(1024, 500)
    .removeAlpha() // Google Play requires 24-bit PNG or JPEG without alpha
    .png()
    .toFile(graphicPath);
  console.log('✓ Generated:', graphicPath);
}

// Function to generate high-res promotional phone screenshots (1080 x 2400)
async function generateScreenshot(filename, config) {
  console.log(`Generating Screenshot: ${filename}...`);
  const { badge, title1, title2, subtitle, mockContentSvg } = config;

  const svg = `
  <svg width="1080" height="2400" viewBox="0 0 1080 2400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0b0f19" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>

      <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#25D366" />
      </linearGradient>

      <linearGradient id="phoneBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#475569" />
        <stop offset="50%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#334155" />
      </linearGradient>

      <filter id="phoneShadow" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="24" stdDeviation="36" flood-color="#000000" flood-opacity="0.8" />
        <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#25D366" flood-opacity="0.15" />
      </filter>

      <radialGradient id="topGlow" cx="50%" cy="15%" r="45%">
        <stop offset="0%" stop-color="#25D366" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#25D366" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Canvas Background -->
    <rect width="1080" height="2400" fill="url(#bg)" />
    <rect width="1080" height="1200" fill="url(#topGlow)" />

    <!-- TOP SECTION: Marketing Copy -->
    <g transform="translate(80, 140)">
      <!-- Pill Tag -->
      <rect x="0" y="0" width="${badge.width}" height="48" rx="24" fill="#1e293b" stroke="#334155" stroke-width="2" />
      <text x="${badge.width / 2}" y="31" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="800" fill="#38bdf8" letter-spacing="1.5" text-anchor="middle">${badge.text}</text>

      <!-- Headline -->
      <text x="0" y="115" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="64" font-weight="900" fill="#ffffff" letter-spacing="-1.5">
        ${title1}
      </text>
      <text x="0" y="185" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="64" font-weight="900" fill="url(#accentGrad)" letter-spacing="-1.5">
        ${title2}
      </text>

      <!-- Subtitle -->
      <text x="0" y="250" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="28" font-weight="400" fill="#94a3b8">
        ${subtitle}
      </text>
    </g>

    <!-- BOTTOM SECTION: Realistic Phone Frame (1080 x 2400 view) -->
    <g transform="translate(100, 500)">
      <!-- Outer Phone Body -->
      <rect x="0" y="0" width="880" height="1860" rx="64" fill="#0f172a" stroke="url(#phoneBorder)" stroke-width="8" filter="url(#phoneShadow)" />

      <!-- Inner Screen Bezel -->
      <rect x="16" y="16" width="848" height="1828" rx="52" fill="#020617" />

      <!-- Status Bar Area -->
      <text x="60" y="65" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="700" fill="#ffffff">9:41</text>
      <!-- Camera Punch-Hole -->
      <circle cx="424" cy="55" r="14" fill="#000000" stroke="#1e293b" stroke-width="2" />
      <!-- Battery & Signal icons -->
      <g transform="translate(730, 48)">
        <rect x="0" y="4" width="22" height="12" rx="3" fill="none" stroke="#ffffff" stroke-width="2" />
        <rect x="3" y="7" width="12" height="6" fill="#ffffff" />
        <rect x="23" y="8" width="2" height="4" fill="#ffffff" />
        <path d="M-15 16 L-15 4 M-21 16 L-21 8 M-27 16 L-27 12" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
      </g>

      <!-- App Header inside Phone -->
      <g transform="translate(36, 100)">
        <rect x="0" y="0" width="808" height="80" rx="20" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />
        <image href="${logoPngBase64}" x="20" y="16" width="48" height="48" rx="12" />
        <text x="82" y="48" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="28" font-weight="900" fill="#ffffff">TwitSticker</text>
        <rect x="630" y="18" width="158" height="44" rx="22" fill="#1e293b" stroke="#334155" stroke-width="1" />
        <text x="709" y="46" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" font-weight="700" fill="#25D366" text-anchor="middle">WASticker ✓</text>
      </g>

      <!-- Mock Content injected here -->
      <g transform="translate(36, 210)">
        ${mockContentSvg}
      </g>

      <!-- Phone Home Indicator Bar -->
      <rect x="290" y="1810" width="268" height="6" rx="3" fill="#64748b" />
    </g>
  </svg>
  `;

  const outPath = path.join(outDir, filename);
  await sharp(Buffer.from(svg))
    .resize(1080, 2400)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log('✓ Generated:', outPath);
}

async function run() {
  await generateAppIcon();
  await generateFeatureGraphic();

  // SCREENSHOT 1: Paste Twitter/X Link
  await generateScreenshot('screenshot-1-import.png', {
    badge: { text: 'STEP 1: IMPORT MEDIA', width: 230 },
    title1: 'Turn Twitter &amp; X Clips',
    title2: 'Into Custom Stickers',
    subtitle: 'Paste any tweet link or upload GIF, MP4 and WebM files',
    mockContentSvg: `
      <!-- Card Container -->
      <rect x="0" y="0" width="808" height="1520" rx="32" fill="#0b1120" stroke="#1e293b" stroke-width="2" />
      
      <!-- Headline inside app -->
      <text x="40" y="60" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="32" font-weight="800" fill="#ffffff">Enter Twitter / X URL</text>
      <text x="40" y="98" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" fill="#94a3b8">Supports status links from x.com or twitter.com</text>

      <!-- Input box -->
      <g transform="translate(40, 130)">
        <rect x="0" y="0" width="728" height="74" rx="20" fill="#1e293b" stroke="#38bdf8" stroke-width="2.5" />
        <text x="24" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="20" fill="#38bdf8">🔗</text>
        <text x="64" y="45" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="20" fill="#f1f5f9">https://x.com/viralmemes/status/1884920</text>
      </g>

      <!-- Convert / Fetch Button -->
      <g transform="translate(40, 230)">
        <rect x="0" y="0" width="728" height="70" rx="20" fill="#0284c7" />
        <text x="364" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="800" fill="#ffffff" text-anchor="middle">⚡ Fetch &amp; Open in Studio</text>
      </g>

      <!-- Divider -->
      <text x="404" y="345" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" fill="#64748b" text-anchor="middle">— OR CHOOSE SAMPLE PRESETS —</text>

      <!-- Preset Grid -->
      <g transform="translate(40, 380)">
        <rect x="0" y="0" width="345" height="120" rx="20" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <text x="30" y="55" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="34">🌈</text>
        <text x="85" y="50" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Rainbow Spin</text>
        <text x="85" y="78" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="15" fill="#94a3b8">Looping Video</text>

        <rect x="383" y="0" width="345" height="120" rx="20" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <text x="413" y="55" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="34">🌍</text>
        <text x="468" y="50" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Earth Orbit</text>
        <text x="468" y="78" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="15" fill="#94a3b8">Classic GIF</text>
      </g>

      <!-- Detected Media Preview Card -->
      <g transform="translate(40, 530)">
        <rect x="0" y="0" width="728" height="580" rx="24" fill="#0f172a" stroke="#334155" stroke-width="2" />
        
        <rect x="24" y="24" width="680" height="420" rx="20" fill="#020617" />
        <image href="${logoPngBase64}" x="164" y="34" width="400" height="400" />
        
        <rect x="40" y="40" width="130" height="34" rx="10" fill="#000000" fill-opacity="0.75" />
        <text x="105" y="62" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14" font-weight="700" fill="#38bdf8" text-anchor="middle">VIDEO READY</text>

        <text x="40" y="490" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="700" fill="#ffffff">Viral Reaction Meme #142</text>
        <text x="40" y="525" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" fill="#94a3b8">Duration: 3.2s • Resolution: 1080p • MP4</text>
      </g>

      <!-- Quick Action Floating Pill -->
      <g transform="translate(180, 1140)">
        <rect x="0" y="0" width="448" height="60" rx="30" fill="#25D366" />
        <text x="224" y="38" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="20" font-weight="800" fill="#ffffff" text-anchor="middle">✨ Open in Sticker Studio</text>
      </g>
    `
  });

  // SCREENSHOT 2: Precision Sticker Studio
  await generateScreenshot('screenshot-2-studio.png', {
    badge: { text: 'STEP 2: CUSTOMIZE &amp; TRIM', width: 250 },
    title1: 'Interactive Studio',
    title2: 'Trim, Crop &amp; Speed',
    subtitle: 'Fine-tune 512×512 square crop, frame rates, and playback speed',
    mockContentSvg: `
      <!-- Card Container -->
      <rect x="0" y="0" width="808" height="1520" rx="32" fill="#0b1120" stroke="#1e293b" stroke-width="2" />
      
      <!-- Studio Live Preview Area -->
      <g transform="translate(144, 40)">
        <rect x="0" y="0" width="520" height="520" rx="28" fill="#1e293b" stroke="#38bdf8" stroke-width="3" />
        <image href="${logoPngBase64}" x="10" y="10" width="500" height="500" rx="24" />
        <!-- Badge -->
        <rect x="20" y="20" width="130" height="34" rx="8" fill="#000000" fill-opacity="0.8" />
        <text x="85" y="42" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="15" font-weight="700" fill="#25D366" text-anchor="middle">512 × 512 PX</text>
      </g>

      <!-- Trim Controls Section -->
      <g transform="translate(40, 600)">
        <text x="0" y="25" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="800" fill="#ffffff">Timeline Trim</text>
        <text x="728" y="25" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="20" font-weight="700" fill="#38bdf8" text-anchor="end">Duration: 2.8s</text>

        <!-- Slider Bar -->
        <rect x="0" y="50" width="728" height="40" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <!-- Selected Range -->
        <rect x="120" y="50" width="450" height="40" rx="10" fill="#0284c7" fill-opacity="0.4" stroke="#38bdf8" stroke-width="2.5" />
        <!-- Left scrubber handle -->
        <rect x="110" y="40" width="20" height="60" rx="8" fill="#38bdf8" />
        <!-- Right scrubber handle -->
        <rect x="560" y="40" width="20" height="60" rx="8" fill="#38bdf8" />
      </g>

      <!-- Crop & Framing Mode -->
      <g transform="translate(40, 750)">
        <text x="0" y="25" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="800" fill="#ffffff">Framing Mode</text>
        <g transform="translate(0, 45)">
          <rect x="0" y="0" width="350" height="64" rx="16" fill="#1e293b" stroke="#38bdf8" stroke-width="2.5" />
          <text x="175" y="39" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="700" fill="#38bdf8" text-anchor="middle">✓ Square Fill (Crop)</text>

          <rect x="378" y="0" width="350" height="64" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
          <text x="553" y="39" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="600" fill="#94a3b8" text-anchor="middle">Fit (Transparent Borders)</text>
        </g>
      </g>

      <!-- Speed Presets -->
      <g transform="translate(40, 920)">
        <text x="0" y="25" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="800" fill="#ffffff">Playback Speed</text>
        <g transform="translate(0, 45)">
          <!-- 0.75x -->
          <rect x="0" y="0" width="160" height="54" rx="14" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
          <text x="80" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="600" fill="#cbd5e1" text-anchor="middle">0.75x</text>

          <!-- 1.0x Active -->
          <rect x="189" y="0" width="160" height="54" rx="14" fill="#25D366" />
          <text x="269" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">1.0x (Normal)</text>

          <!-- 1.25x -->
          <rect x="378" y="0" width="160" height="54" rx="14" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
          <text x="458" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="600" fill="#cbd5e1" text-anchor="middle">1.25x</text>

          <!-- 1.5x -->
          <rect x="568" y="0" width="160" height="54" rx="14" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
          <text x="648" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="600" fill="#cbd5e1" text-anchor="middle">1.5x</text>
        </g>
      </g>

      <!-- Bottom Convert CTA Button -->
      <g transform="translate(40, 1100)">
        <rect x="0" y="0" width="728" height="74" rx="22" fill="#25D366" />
        <text x="364" y="46" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="24" font-weight="900" fill="#ffffff" text-anchor="middle">GENERATE ANIMATED STICKER ✨</text>
      </g>
    `
  });

  // SCREENSHOT 3: Live WhatsApp Chat Simulation
  await generateScreenshot('screenshot-3-preview.png', {
    badge: { text: 'STEP 3: LIVE PREVIEW', width: 230 },
    title1: 'Realistic Chat Preview',
    title2: 'Dark &amp; Light Themes',
    subtitle: 'Inspect your sticker in authentic WhatsApp bubbles before exporting',
    mockContentSvg: `
      <!-- WhatsApp Container simulating phone chat screen -->
      <rect x="0" y="0" width="808" height="1520" rx="32" fill="#0b141a" stroke="#1e293b" stroke-width="2" />
      
      <!-- WhatsApp Chat Header -->
      <g transform="translate(0, 0)">
        <path d="M 0 32 Q 0 0 32 0 L 776 0 Q 808 0 808 32 L 808 110 L 0 110 Z" fill="#202c33" />
        <circle cx="60" cy="55" r="26" fill="#25D366" />
        <text x="60" y="64" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="26" fill="#ffffff" text-anchor="middle">👥</text>
        <text x="105" y="48" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="24" font-weight="700" fill="#e9edef">Squad Group Chat 🔥</text>
        <text x="105" y="76" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" fill="#8696a0">online • 5 participants</text>

        <!-- Right action icons -->
        <text x="740" y="62" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="26" fill="#aebac1">⋮</text>
      </g>

      <!-- Date chip -->
      <g transform="translate(324, 140)">
        <rect x="0" y="0" width="160" height="36" rx="10" fill="#182229" />
        <text x="80" y="24" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14" font-weight="600" fill="#8696a0" text-anchor="middle">TODAY</text>
      </g>

      <!-- Incoming Message 1 -->
      <g transform="translate(40, 200)">
        <rect x="0" y="0" width="520" height="74" rx="16" fill="#202c33" />
        <text x="24" y="32" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="15" font-weight="700" fill="#53bdeb">Alex</text>
        <text x="24" y="58" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" fill="#e9edef">Send that Twitter GIF as a sticker! 🤣</text>
        <text x="460" y="60" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="12" fill="#8696a0">12:44</text>
      </g>

      <!-- Outgoing Animated Sticker Bubble -->
      <g transform="translate(248, 305)">
        <rect x="0" y="0" width="520" height="540" rx="24" fill="#005c4b" stroke="#056162" stroke-width="1.5" />
        
        <!-- Sticker Artwork inside WhatsApp Bubble -->
        <rect x="20" y="20" width="480" height="440" rx="18" fill="#0b1120" />
        <image href="${logoPngBase64}" x="60" y="30" width="400" height="400" />
        
        <!-- Animated Badge Overlay -->
        <rect x="36" y="36" width="120" height="32" rx="8" fill="#000000" fill-opacity="0.8" />
        <text x="96" y="58" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="13" font-weight="800" fill="#25D366" text-anchor="middle">ANIMATED</text>

        <!-- Message Time & Read Status -->
        <text x="430" y="500" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="15" fill="#8696a0">12:45</text>
        <text x="475" y="500" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" fill="#53bdeb">✓✓</text>
      </g>

      <!-- Incoming Reaction -->
      <g transform="translate(40, 880)">
        <rect x="0" y="0" width="420" height="66" rx="16" fill="#202c33" />
        <text x="24" y="28" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14" font-weight="700" fill="#e542a3">Sarah</text>
        <text x="24" y="52" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" fill="#e9edef">OMG that's so smooth!! Adding to favs ❤️</text>
      </g>

      <!-- Bottom Chat Bar -->
      <g transform="translate(40, 1000)">
        <rect x="0" y="0" width="620" height="70" rx="35" fill="#2a3942" />
        <text x="30" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="24">😊</text>
        <text x="75" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="20" fill="#8696a0">Message...</text>
        <text x="560" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="24">📎</text>

        <circle cx="685" cy="35" r="35" fill="#00a884" />
        <text x="685" y="44" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="24" fill="#ffffff" text-anchor="middle">🎤</text>
      </g>

      <!-- Floating Compliance Pill -->
      <g transform="translate(180, 1140)">
        <rect x="0" y="0" width="448" height="54" rx="27" fill="#1e293b" stroke="#25D366" stroke-width="2" />
        <text x="224" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="17" font-weight="700" fill="#25D366" text-anchor="middle">✓ &lt; 500 KB WhatsApp Certified</text>
      </g>
    `
  });

  // SCREENSHOT 4: 1-Tap Export & Pack Management
  await generateScreenshot('screenshot-4-export.png', {
    badge: { text: 'STEP 4: 1-TAP EXPORT', width: 230 },
    title1: 'Add to WhatsApp',
    title2: 'With A Single Tap',
    subtitle: 'Direct WASticker pack integration with custom author metadata',
    mockContentSvg: `
      <!-- Card Container -->
      <rect x="0" y="0" width="808" height="1520" rx="32" fill="#0b1120" stroke="#1e293b" stroke-width="2" />
      
      <!-- Sticker Pack Header Card -->
      <g transform="translate(40, 40)">
        <rect x="0" y="0" width="728" height="200" rx="24" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
        <image href="${logoPngBase64}" x="24" y="24" width="152" height="152" rx="20" />
        <text x="200" y="70" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="28" font-weight="900" fill="#ffffff">Viral Memes Pack</text>
        <text x="200" y="105" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" fill="#94a3b8">Created by @twitsticker</text>
        
        <!-- Status chips -->
        <rect x="200" y="130" width="120" height="32" rx="8" fill="#1e293b" />
        <text x="260" y="152" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14" font-weight="700" fill="#38bdf8" text-anchor="middle">3 Stickers</text>

        <rect x="335" y="130" width="140" height="32" rx="8" fill="#1e293b" />
        <text x="405" y="152" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="14" font-weight="700" fill="#25D366" text-anchor="middle">412 KB Total</text>
      </g>

      <!-- Pack Grid Preview -->
      <g transform="translate(40, 270)">
        <text x="0" y="25" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="22" font-weight="800" fill="#ffffff">Stickers In This Pack</text>

        <!-- Sticker 1 -->
        <g transform="translate(0, 45)">
          <rect x="0" y="0" width="225" height="225" rx="20" fill="#1e293b" stroke="#334155" stroke-width="2" />
          <image href="${logoPngBase64}" x="12" y="12" width="200" height="200" />
          <circle cx="195" cy="30" r="14" fill="#25D366" />
          <text x="195" y="35" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">✓</text>
        </g>

        <!-- Sticker 2 -->
        <g transform="translate(251, 45)">
          <rect x="0" y="0" width="225" height="225" rx="20" fill="#1e293b" stroke="#334155" stroke-width="2" />
          <image href="${logoPngBase64}" x="12" y="12" width="200" height="200" />
          <circle cx="195" cy="30" r="14" fill="#25D366" />
          <text x="195" y="35" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">✓</text>
        </g>

        <!-- Sticker 3 -->
        <g transform="translate(502, 45)">
          <rect x="0" y="0" width="225" height="225" rx="20" fill="#1e293b" stroke="#334155" stroke-width="2" />
          <image href="${logoPngBase64}" x="12" y="12" width="200" height="200" />
          <circle cx="195" cy="30" r="14" fill="#25D366" />
          <text x="195" y="35" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">✓</text>
        </g>
      </g>

      <!-- Metadata Box -->
      <g transform="translate(40, 580)">
        <rect x="0" y="0" width="728" height="210" rx="20" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />
        <text x="24" y="40" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="800" fill="#38bdf8">WHATSAPP EXIF METADATA</text>
        
        <text x="24" y="80" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" fill="#94a3b8">Sticker Pack Name:</text>
        <text x="220" y="80" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" font-weight="600" fill="#ffffff">TwitSticker Viral Vol. 1</text>

        <text x="24" y="120" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" fill="#94a3b8">Publisher / Author:</text>
        <text x="220" y="120" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" font-weight="600" fill="#ffffff">TwitSticker User</text>

        <text x="24" y="160" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="16" fill="#94a3b8">Associated Emojis:</text>
        <text x="220" y="160" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18">😂 🔥 🚀 ✨</text>
      </g>

      <!-- Primary Big Action: Add to WhatsApp -->
      <g transform="translate(40, 830)">
        <rect x="0" y="0" width="728" height="84" rx="24" fill="#25D366" />
        <text x="364" y="52" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="26" font-weight="900" fill="#ffffff" text-anchor="middle">ADD TO WHATSAPP 💬</text>
      </g>

      <!-- Secondary Actions (Download WebP / Share) -->
      <g transform="translate(40, 940)">
        <rect x="0" y="0" width="350" height="64" rx="18" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <text x="175" y="39" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">💾 Download .WebP</text>

        <rect x="378" y="0" width="350" height="64" rx="18" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <text x="553" y="39" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">📤 Share Sticker</text>
      </g>

      <!-- Confirmation Toast -->
      <g transform="translate(140, 1070)">
        <rect x="0" y="0" width="528" height="54" rx="27" fill="#065f46" stroke="#10b981" stroke-width="1.5" />
        <text x="264" y="34" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">✓ Added to WhatsApp successfully!</text>
      </g>
    `
  });

  console.log('\nAll Play Store assets generated successfully in ./playstore/ !');
}

run().catch(console.error);
