const SITE_URL = 'https://gifsticker.site';
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SEO_PAGES = {
  'twitter-to-whatsapp-sticker': {
    slug: 'twitter-to-whatsapp-sticker',
    shortLabel: 'Twitter / X to Sticker',
    title: 'Twitter & X Video to WhatsApp Sticker Converter (Free Online)',
    description: 'Convert any Twitter or X video, meme, or animated GIF into an official 512x512 transparent animated WhatsApp sticker under 500 KB. No watermark, works on Android, iPhone & WhatsApp Web.',
    keywords: 'twitter to whatsapp sticker, convert twitter video to whatsapp sticker, x video to whatsapp sticker, turn tweet video into sticker, twitter gif to whatsapp sticker, x meme to sticker, save twitter video as sticker',
    h1Html: 'Convert <span class="text-[#1DA1F2]">Twitter &amp; X Videos</span> to <span class="text-[#25D366]">WhatsApp Stickers</span>',
    heroSubtitle: 'Paste any X or Twitter post link with a video or GIF to create an official 512×512 animated WhatsApp sticker under 500 KB — zero watermarks, instant mobile &amp; WhatsApp Web export.',
    guideHeading: 'How to Turn <span class="text-[#1DA1F2]">Twitter / X Videos</span> into <span class="text-[#25D366]">WhatsApp Stickers</span>',
    guideSubheading: 'Everything you need to convert viral X clips, reaction GIFs, and memes into compliant animated WhatsApp stickers.',
    howToName: 'How to Convert a Twitter or X Video to a WhatsApp Sticker',
    howToSteps: [
      { name: 'Copy the Twitter / X Link', text: 'Tap Share on any public Twitter or X post containing a video or GIF and copy the post URL.' },
      { name: 'Paste into TwitSticker', text: 'Paste the tweet link into the converter above and click Load Media to fetch the video stream automatically.' },
      { name: 'Trim & Frame Your Clip', text: 'Select the best 1–3.5 second reaction loop, pick transparent padding or square crop, and adjust speed or FPS.' },
      { name: 'Generate & Add to WhatsApp', text: 'Click Generate WhatsApp Sticker for a 512x512 animated WebP under 500 KB, then export to WhatsApp on Android, iPhone, or WhatsApp Web.' }
    ],
    faqs: [
      {
        icon: 'help-circle',
        q: 'How do I convert a Twitter or X video into a WhatsApp sticker?',
        a: 'Copy the link of any public Twitter/X post with a video or GIF, paste it into the input box above, trim your favorite moment, and click Generate WhatsApp Sticker. You will get an official 512x512 animated WebP file under 500 KB ready for WhatsApp.'
      },
      {
        icon: 'shield-check',
        q: 'Do I need to log into my Twitter / X account?',
        a: 'No login or Twitter API authorization is required. TwitSticker resolves public tweet videos and GIFs directly so you can make stickers privately with zero watermarks.'
      },
      {
        icon: 'smartphone',
        q: 'Does it work for both x.com and twitter.com links?',
        a: 'Yes! TwitSticker supports x.com, twitter.com, mobile.twitter.com, fxtwitter, and vxtwitter URLs, as well as direct twimg video links.'
      },
      {
        icon: 'check-circle-2',
        q: 'Why is my Twitter video automatically compressed under 500 KB?',
        a: 'WhatsApp strictly rejects animated stickers larger than 500 KB or not sized to 512x512 pixels. TwitSticker automatically optimizes resolution, frame rate, and WebP compression so every sticker imports cleanly.'
      }
    ]
  },

  'gif-to-whatsapp-sticker': {
    slug: 'gif-to-whatsapp-sticker',
    shortLabel: 'GIF / GIPHY / Tenor',
    title: 'GIF to WhatsApp Sticker Converter — GIPHY, Tenor & Animated GIFs',
    description: 'Convert any GIF, GIPHY link, or Tenor link into a 512x512 transparent animated WhatsApp sticker under 500 KB. Free online GIF to WebP sticker maker for Android, iOS & WhatsApp Web.',
    keywords: 'gif to whatsapp sticker, giphy to whatsapp sticker, tenor gif to whatsapp sticker, convert animated gif to webp sticker, turn gif into whatsapp sticker, online gif sticker maker, transparent gif to whatsapp sticker',
    h1Html: 'Convert <span class="text-[#1DA1F2]">GIF, GIPHY &amp; Tenor</span> to <span class="text-[#25D366]">WhatsApp Stickers</span>',
    heroSubtitle: 'Paste a GIPHY, Tenor, Imgur, or direct .gif URL — or upload any GIF from your device — to create crisp 512×512 transparent animated WhatsApp stickers under 500 KB.',
    guideHeading: 'Convert Any <span class="text-[#1DA1F2]">Animated GIF</span> into a <span class="text-[#25D366]">WhatsApp Sticker</span>',
    guideSubheading: 'Preserve alpha transparency, smooth looping, and sharp quality when converting GIFs to WhatsApp animated WebP format.',
    howToName: 'How to Convert a GIF, GIPHY, or Tenor Link to a WhatsApp Sticker',
    howToSteps: [
      { name: 'Paste GIF Link or Upload File', text: 'Paste a GIPHY, Tenor, Imgur, or direct .gif URL — or switch to the Upload File tab to select a local GIF.' },
      { name: 'Keep Transparency or Square Crop', text: 'Choose Fit with Transparency to preserve transparent GIF backgrounds and aspect ratio, or Square Crop to fill 512x512.' },
      { name: 'Adjust Loop Length & Speed', text: 'Trim long GIFs to 2–3.5 seconds for smooth playback and crisp detail under WhatsApp\'s 500 KB cap.' },
      { name: 'Download or Send to WhatsApp', text: 'Generate your animated WebP sticker and add it to WhatsApp on mobile or drag-and-drop into WhatsApp Web.' }
    ],
    faqs: [
      {
        icon: 'sparkles',
        q: 'Can I paste GIPHY and Tenor links directly?',
        a: 'Yes! Paste any GIPHY or Tenor page URL (or direct media.giphy.com / media.tenor.com link) and TwitSticker automatically extracts the highest-quality animated stream for conversion.'
      },
      {
        icon: 'layers',
        q: 'Does converting a GIF to a WhatsApp sticker preserve transparency?',
        a: 'Yes. Selecting Fit with Transparency preserves transparent backgrounds and adds clean alpha-channel padding to meet WhatsApp\'s exact 512x512 pixel specification.'
      },
      {
        icon: 'zap',
        q: 'Why does WhatsApp require WebP instead of GIF for stickers?',
        a: 'WhatsApp stickers use the animated WebP container with embedded EXIF sticker-pack metadata, whereas GIFs are sent as regular video/GIF attachments. TwitSticker converts GIFs to spec-compliant animated WebP with EXIF tags automatically.'
      },
      {
        icon: 'smartphone',
        q: 'How do I send the converted GIF sticker on iPhone, Android, and WhatsApp Web?',
        a: 'On WhatsApp Web, drag and drop the downloaded .webp file directly into any chat. On Android or iPhone, tap Save Sticker & Open WhatsApp and import via WhatsApp\'s Stickers (+) button or .wastickers pack.'
      }
    ]
  },

  'mp4-to-whatsapp-sticker': {
    slug: 'mp4-to-whatsapp-sticker',
    shortLabel: 'MP4 / Video to Sticker',
    title: 'MP4 to WhatsApp Animated Sticker Maker (MOV, WebM & Video to WebP)',
    description: 'Turn any MP4, MOV, or WebM video clip into a 512x512 animated WhatsApp sticker under 500 KB. Trim clips, adjust speed & FPS, add captions, and export with WhatsApp EXIF metadata.',
    keywords: 'mp4 to whatsapp sticker, video to whatsapp sticker, mov to whatsapp sticker, webm to whatsapp sticker, convert video clip to animated sticker, video to 512x512 webp sticker, free video sticker maker',
    h1Html: 'Convert <span class="text-[#1DA1F2]">MP4 &amp; Video Clips</span> to <span class="text-[#25D366]">WhatsApp Stickers</span>',
    heroSubtitle: 'Upload any MP4, MOV, or WebM video (up to 50 MB) or paste a direct video link. Trim the exact moment, optimize under 500 KB, and export an official 512×512 animated WhatsApp sticker.',
    guideHeading: 'Turn Any <span class="text-[#1DA1F2]">MP4, MOV, or WebM</span> into a <span class="text-[#25D366]">WhatsApp Sticker</span>',
    guideSubheading: 'Built-in video trimmer, speed controls, transparent padding, and automatic 500 KB optimization for smooth animated stickers.',
    howToName: 'How to Convert an MP4 Video to a WhatsApp Animated Sticker',
    howToSteps: [
      { name: 'Upload Your Video', text: 'Click the Upload File tab and choose an MP4, WebM, or QuickTime MOV clip from your phone or computer (up to 50 MB).' },
      { name: 'Trim the Best Moment', text: 'Use the start and length sliders to isolate a punchy 1–3.5 second reaction clip (up to 6s with Pro).' },
      { name: 'Customize Fit, Speed & FPS', text: 'Pick Fit with Transparency or Square Crop, set playback speed (0.75x–1.5x), and choose your frame rate.' },
      { name: 'Export to WhatsApp', text: 'Generate your 512x512 animated WebP under 500 KB and send it in WhatsApp Mobile or WhatsApp Web.' }
    ],
    faqs: [
      {
        icon: 'file-video',
        q: 'Which video formats are supported for WhatsApp stickers?',
        a: 'TwitSticker supports MP4, WebM, QuickTime MOV (iPhone videos), animated GIF, and animated WebP files up to 50 MB.'
      },
      {
        icon: 'scissors',
        q: 'How long can an animated WhatsApp sticker be?',
        a: 'WhatsApp allows animated stickers up to 10 seconds, though 2 to 3.5 seconds delivers the sharpest visual quality while staying strictly under the 500 KB file size limit. Pro users can create clips up to 6 seconds at up to 20 FPS.'
      },
      {
        icon: 'crop',
        q: 'Will my vertical or widescreen MP4 get stretched?',
        a: 'No! By default, Fit with Transparency scales your video proportionally inside the 512x512 square with transparent edges, or you can switch to Square Crop to fill the frame cleanly without distortion.'
      },
      {
        icon: 'lock',
        q: 'Are my uploaded videos kept private?',
        a: 'Yes. Uploaded files are deleted immediately after conversion, and generated sticker caches are automatically purged after inactivity. We never publish or index user uploads.'
      }
    ]
  },

  'reddit-to-whatsapp-sticker': {
    slug: 'reddit-to-whatsapp-sticker',
    shortLabel: 'Reddit & Imgur to Sticker',
    title: 'Reddit & Imgur Video/GIF to WhatsApp Sticker Converter (Free Online)',
    description: 'Convert Reddit videos, v.redd.it clips, and Imgur GIFs/GIFVs into official 512x512 animated WhatsApp stickers under 500 KB. Free online maker with zero watermarks.',
    keywords: 'reddit to whatsapp sticker, reddit video to whatsapp sticker, imgur gif to whatsapp sticker, v.redd.it to sticker, discord gif to whatsapp sticker, pinterest gif to whatsapp sticker, meme to whatsapp sticker',
    h1Html: 'Convert <span class="text-[#1DA1F2]">Reddit &amp; Imgur Clips</span> to <span class="text-[#25D366]">WhatsApp Stickers</span>',
    heroSubtitle: 'Paste any Reddit post, Imgur GIF/GIFV, Discord media URL, or Pinterest clip and turn it into a 512×512 animated WhatsApp sticker under 500 KB in seconds.',
    guideHeading: 'Turn <span class="text-[#1DA1F2]">Reddit, Imgur &amp; Discord Memes</span> into <span class="text-[#25D366]">WhatsApp Stickers</span>',
    guideSubheading: 'No need to download videos first — paste the link directly and let TwitSticker handle extraction, trimming, and WebP compression.',
    howToName: 'How to Convert a Reddit or Imgur Link to a WhatsApp Sticker',
    howToSteps: [
      { name: 'Copy the Reddit or Imgur URL', text: 'Copy the share link of any public Reddit video/GIF post, Imgur GIF/GIFV, or Discord media attachment.' },
      { name: 'Load Media in TwitSticker', text: 'Paste the URL into the box above and tap Load Media to preview the clip instantly.' },
      { name: 'Trim & Optimize', text: 'Set your start point, loop duration, and fit mode (transparent padding or square crop).' },
      { name: 'Save & Send to WhatsApp', text: 'Click Generate WhatsApp Sticker to download your compliant 512x512 animated WebP under 500 KB.' }
    ],
    faqs: [
      {
        icon: 'link-2',
        q: 'Does TwitSticker work with Reddit v.redd.it and share links?',
        a: 'Yes! Paste standard reddit.com post URLs, redd.it short links, or direct v.redd.it / i.redd.it media links and TwitSticker resolves the video or GIF automatically.'
      },
      {
        icon: 'image',
        q: 'Can I convert Imgur .gifv and Discord CDN links?',
        a: 'Yes. Imgur gallery pages, .gifv links, Discord CDN media URLs, and Pinterest animated clips are all supported directly from the link box.'
      },
      {
        icon: 'check-circle-2',
        q: 'Are stickers watermark-free and WhatsApp compliant?',
        a: 'Every sticker is exported at exactly 512x512 pixels in animated WebP format under 500 KB with WhatsApp EXIF metadata and zero watermarks.'
      },
      {
        icon: 'smartphone',
        q: 'Does it work on Android, iPhone, and Desktop?',
        a: 'Yes, TwitSticker works in any modern browser on Android, iOS, Windows, and macOS, plus we offer an Android companion app for 1-tap WhatsApp pack installation.'
      }
    ]
  },

  'whatsapp-animated-sticker-maker': {
    slug: 'whatsapp-animated-sticker-maker',
    shortLabel: 'Animated Sticker Maker',
    title: 'Free Animated WhatsApp Sticker Maker Online (512x512 WebP + EXIF)',
    description: 'Create custom animated WhatsApp stickers online for free. Trim videos & GIFs, add meme captions, borders, boomerang loops, and custom EXIF pack names — guaranteed 512x512 under 500 KB.',
    keywords: 'whatsapp animated sticker maker, create animated whatsapp stickers online, custom whatsapp sticker studio, animated webp sticker generator, whatsapp sticker creator with text, boomerang whatsapp sticker maker, whatsapp sticker pack maker',
    h1Html: 'Free <span class="text-[#1DA1F2]">Animated WhatsApp</span> <span class="text-[#25D366]">Sticker Maker</span> Online',
    heroSubtitle: 'Create custom 512×512 animated WhatsApp stickers from any link or video file. Trim loops, preview in Dark/Light WhatsApp chat, and unlock captions, borders &amp; boomerang effects.',
    guideHeading: 'Build Custom <span class="text-[#25D366]">Animated WhatsApp Stickers</span> Like a Pro',
    guideSubheading: 'Live WhatsApp chat preview, automatic 500 KB spec compliance, and creative studio controls right in your browser.',
    howToName: 'How to Make Custom Animated Stickers for WhatsApp',
    howToSteps: [
      { name: 'Import Any Link or Video', text: 'Paste a Twitter/X, GIPHY, Tenor, Reddit, or Imgur link, or upload any MP4, MOV, WebM, or GIF file.' },
      { name: 'Edit Timing & Framing', text: 'Trim the clip, adjust playback speed and FPS, and choose Fit with Transparency or Square Crop.' },
      { name: 'Add Optional Studio Effects', text: 'Customize EXIF pack metadata or unlock Pro for meme captions, white outlines, circle/rounded shapes, and boomerang loops.' },
      { name: 'Preview & Export to WhatsApp', text: 'Inspect your sticker in Dark or Light WhatsApp chat preview, then export via 1-tap mobile save, .wastickers pack, or WhatsApp Web drag-and-drop.' }
    ],
    faqs: [
      {
        icon: 'wand-2',
        q: 'What creative features are included in the sticker studio?',
        a: 'Free users get trimming, transparent padding or square crop, speed control, 10–14 FPS encoding, Dark/Light WhatsApp preview, and EXIF metadata. Pro adds meme text captions, white outlines, rounded/circle shapes, reverse & boomerang loops, up to 6s / 20 FPS, custom EXIF branding, and ad-free unlimited stickers.'
      },
      {
        icon: 'eye',
        q: 'Can I preview how my sticker looks in WhatsApp before exporting?',
        a: 'Yes! TwitSticker includes a live WhatsApp Sticker Preview switcher so you can inspect your animated sticker on a transparent grid, Dark Mode WhatsApp chat, or Light Mode WhatsApp chat.'
      },
      {
        icon: 'package',
        q: 'Does TwitSticker export both .webp and .wastickers packs?',
        a: 'Yes. Every conversion produces a raw 512x512 animated .webp file with WhatsApp EXIF metadata plus a .wastickers pack file for Sticker Maker apps.'
      },
      {
        icon: 'star',
        q: 'How do I save my custom sticker to my WhatsApp favorites?',
        a: 'Once sent in any WhatsApp chat (via WhatsApp Web drag-and-drop or mobile Stickers + Create), tap the sticker and select Add to Favorites so it stays in your keyboard forever.'
      }
    ]
  },

  'whatsapp-sticker-500kb-compressor': {
    slug: 'whatsapp-sticker-500kb-compressor',
    shortLabel: '500KB Sticker Compressor',
    title: 'WhatsApp Sticker 500KB Compressor & 512x512 Animated WebP Resizer',
    description: 'Automatically resize and compress any animated WebP, GIF, or video to exact 512x512 dimensions under WhatsApp\'s strict 500 KB animated sticker limit with EXIF metadata.',
    keywords: 'compress whatsapp sticker under 500kb, whatsapp sticker 500kb limit fixer, resize gif to 512x512 webp, animated webp compressor 500kb, fix whatsapp sticker too large error, 512x512 transparent webp converter',
    h1Html: '<span class="text-[#1DA1F2]">500 KB WhatsApp Sticker</span> <span class="text-[#25D366]">Compressor &amp; Resizer</span>',
    heroSubtitle: 'Fix "sticker file too large" errors automatically. Upload any GIF, WebP, or video to resize to exactly 512×512 with alpha transparency and smart compression guaranteed under 500 KB.',
    guideHeading: 'Fix WhatsApp\'s <span class="text-[#25D366]">500 KB &amp; 512×512</span> Sticker Requirements',
    guideSubheading: 'Multi-pass FFmpeg WebP optimization guarantees WhatsApp acceptance without blurry artifacts.',
    howToName: 'How to Compress an Animated Sticker Under 500 KB for WhatsApp',
    howToSteps: [
      { name: 'Upload Your Oversized GIF, WebP, or Video', text: 'Switch to Upload File (or paste a link) to load the media that failed WhatsApp\'s 500 KB or 512x512 check.' },
      { name: 'Tune Duration & Frame Rate', text: 'Keep loops between 2.0 and 3.5 seconds at 10–14 FPS for maximum visual sharpness under 500 KB.' },
      { name: 'Auto-Resize to 512×512', text: 'TwitSticker scales your media to exact 512x512 pixels with transparent margins or square crop.' },
      { name: 'Download Compliant WebP', text: 'Our multi-pass encoder automatically targets under 500 KB and injects required WhatsApp EXIF metadata.' }
    ],
    faqs: [
      {
        icon: 'check-circle-2',
        q: 'Why does WhatsApp reject animated stickers over 500 KB?',
        a: 'WhatsApp enforces a hard 500 KB limit for animated WebP stickers (100 KB for static stickers) and exact 512x512 pixel dimensions. Files even 1 KB over 500 KB will fail to import.'
      },
      {
        icon: 'cpu',
        q: 'How does TwitSticker guarantee stickers stay under 500 KB?',
        a: 'TwitSticker uses adaptive multi-pass libwebp encoding that balances compression quality and frame timing until the final animated WebP — including EXIF metadata — fits safely under 500 KB.'
      },
      {
        icon: 'sliders',
        q: 'How can I make my compressed sticker look even sharper?',
        a: 'Trimming your clip to 2.0–3.0 seconds or lowering FPS from 14 to 10 allocates more kilobytes per frame, resulting in dramatically crisper animation under the 500 KB ceiling.'
      },
      {
        icon: 'tag',
        q: 'Does compression preserve WhatsApp EXIF sticker metadata?',
        a: 'Yes. After compression, TwitSticker injects a valid WhatsApp EXIF chunk containing sticker pack ID, pack name, publisher, and emoji tags so WhatsApp recognizes it natively.'
      }
    ]
  }
};

function buildPageJsonLd(page) {
  const pageUrl = `${SITE_URL}/${page.slug}`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'TwitSticker Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: page.shortLabel, item: pageUrl }
        ]
      },
      {
        '@type': 'WebApplication',
        name: `TwitSticker — ${page.shortLabel}`,
        url: pageUrl,
        image: OG_IMAGE_URL,
        description: page.description,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Android, iOS, Windows, macOS, Linux, ChromeOS',
        browserRequirements: 'Requires JavaScript. Requires HTML5.',
        offers: [
          { '@type': 'Offer', name: 'Free Plan', price: '0', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'TwitSticker Pro Monthly', price: '1.49', priceCurrency: 'USD' }
        ],
        publisher: {
          '@type': 'Organization',
          name: 'TwitSticker',
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/logo.png`
        }
      },
      {
        '@type': 'HowTo',
        name: page.howToName,
        description: page.description,
        totalTime: 'PT30S',
        step: page.howToSteps.map((s, idx) => ({
          '@type': 'HowToStep',
          position: idx + 1,
          name: s.name,
          text: s.text
        }))
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.a
          }
        }))
      }
    ]
  };
  return `<script type="application/ld+json">\n${JSON.stringify(graph, null, 2)}\n  </script>`;
}

function buildBreadcrumbHtml(page) {
  return `
    <nav aria-label="Breadcrumb" class="max-w-3xl mx-auto mb-3 sm:mb-4 flex items-center justify-center gap-2 text-xs text-slate-400">
      <a href="/" class="hover:text-[#25D366] transition">Home</a>
      <span aria-hidden="true" class="text-slate-600">/</span>
      <span class="text-slate-200 font-medium">${escapeHtml(page.shortLabel)}</span>
    </nav>`;
}

function buildHeroHtml(page) {
  return `<!-- SEO_HERO_START -->
    <div class="text-center max-w-3xl mx-auto mb-4 sm:mb-8">
      <h1 class="text-2xl sm:text-5xl font-['Outfit'] font-extrabold tracking-tight text-white mb-2 sm:mb-3">
        ${page.h1Html}
      </h1>
      <p class="text-slate-400 text-xs sm:text-base leading-relaxed px-1">
        ${page.heroSubtitle}
      </p>
    </div>
    <!-- SEO_HERO_END -->`;
}

function buildFaqSectionHtml(page) {
  const cards = page.faqs.map(f => `
        <div class="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4 sm:p-5 space-y-2">
          <div class="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <i data-lucide="${escapeHtml(f.icon || 'help-circle')}" class="w-4 h-4 text-emerald-400 shrink-0"></i>
            <h3>${escapeHtml(f.q)}</h3>
          </div>
          <p class="text-slate-300 leading-relaxed text-xs">${escapeHtml(f.a)}</p>
        </div>`).join('\n');

  const steps = page.howToSteps.map((s, idx) => `
        <li class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <span class="w-6 h-6 rounded-full bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] font-bold text-xs flex items-center justify-center shrink-0">${idx + 1}</span>
          <div>
            <h3 class="text-white font-semibold text-xs sm:text-sm mb-1">${escapeHtml(s.name)}</h3>
            <p class="text-slate-400 text-xs leading-relaxed">${escapeHtml(s.text)}</p>
          </div>
        </li>`).join('\n');

  return `<!-- SEO_CONTENT_START -->
    <section class="mt-10 sm:mt-14 mb-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-xl space-y-8">
      <div class="text-center max-w-2xl mx-auto">
        <h2 class="font-['Outfit'] font-extrabold text-xl sm:text-3xl text-white mb-2">
          ${page.guideHeading}
        </h2>
        <p class="text-slate-400 text-xs sm:text-sm">
          ${page.guideSubheading}
        </p>
      </div>

      <ol class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
${steps}
      </ol>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 text-xs sm:text-sm">
${cards}
      </div>
    </section>
    <!-- SEO_CONTENT_END -->`;
}

function renderSeoPage(baseHtml, slug) {
  const page = SEO_PAGES[slug];
  if (!page) return null;

  const pageUrl = `${SITE_URL}/${page.slug}`;
  const safeTitle = escapeHtml(page.title);
  const safeDesc = escapeHtml(page.description);
  const safeKeywords = escapeHtml(page.keywords);

  let html = baseHtml;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${safeTitle}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${safeDesc}">`);
  html = html.replace(/<meta name="keywords" content="[^"]*">/, `<meta name="keywords" content="${safeKeywords}">`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${pageUrl}">`);

  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${pageUrl}">`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${safeTitle}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${safeDesc}">`);

  html = html.replace(/<meta name="twitter:url" content="[^"]*">/, `<meta name="twitter:url" content="${pageUrl}">`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${safeTitle}">`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${safeDesc}">`);

  html = html.replace(/<!-- SEO_JSONLD_START -->[\s\S]*?<!-- SEO_JSONLD_END -->/, `<!-- SEO_JSONLD_START -->\n  ${buildPageJsonLd(page)}\n  <!-- SEO_JSONLD_END -->`);
  html = html.replace('<!-- SEO_BREADCRUMB -->', buildBreadcrumbHtml(page));
  html = html.replace(/<!-- SEO_HERO_START -->[\s\S]*?<!-- SEO_HERO_END -->/, buildHeroHtml(page));
  html = html.replace(/<!-- SEO_CONTENT_START -->[\s\S]*?<!-- SEO_CONTENT_END -->/, buildFaqSectionHtml(page));

  return html;
}

function renderSharedStickerPage(baseHtml, { title, desc, absoluteStickerUrl, shareUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(desc);
  const safeImg = escapeHtml(absoluteStickerUrl);
  const safeUrl = escapeHtml(shareUrl);

  let html = baseHtml;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${safeTitle}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${safeDesc}">`);
  // Ephemeral 2-hour shared sticker pages should not be indexed by search engines
  html = html.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="noindex, follow">`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${safeUrl}">`);

  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${safeTitle}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${safeDesc}">`);
  html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${safeImg}">`);
  html = html.replace(/<meta property="og:image:width" content="[^"]*">/, `<meta property="og:image:width" content="512">`);
  html = html.replace(/<meta property="og:image:height" content="[^"]*">/, `<meta property="og:image:height" content="512">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${safeUrl}">`);

  html = html.replace(/<meta name="twitter:url" content="[^"]*">/, `<meta name="twitter:url" content="${safeUrl}">`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${safeTitle}">`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${safeDesc}">`);
  html = html.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${safeImg}">`);

  return html;
}

module.exports = {
  SEO_PAGES,
  SEO_SLUGS: Object.keys(SEO_PAGES),
  escapeHtml,
  renderSeoPage,
  renderSharedStickerPage
};
