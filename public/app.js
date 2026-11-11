// TwitSticker Client Application

document.addEventListener('DOMContentLoaded', () => {
  // Lucide Icons initialization
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // App State
  const state = {
    currentSourceType: null, // 'url' | 'file' | 'sample'
    videoUrl: null,
    localFile: null,
    mediaMetadata: null,
    duration: 3.0,
    startTime: 0.0,
    trimDuration: 3.0,
    fps: 14,
    speed: 1.0,
    fitMode: 'fit', // 'fit' | 'crop'
    lastResult: null
  };

  // Local Storage Key & Helpers (Declared upfront to prevent TDZ ReferenceError)
  const STORAGE_KEY = 'twit_stickers_history_v1';

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveToHistory(item) {
    try {
      const list = getHistory();
      const entry = {
        id: item.stickerId,
        url: item.url,
        downloadUrl: item.downloadUrl,
        packUrl: item.packUrl,
        sizeKb: item.sizeKb,
        packName: item.metadata?.packName || 'Twitter Sticker',
        timestamp: Date.now()
      };
      list.unshift(entry);
      const trimmed = list.slice(0, 20);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      updateHistoryBadge();
    } catch (e) {
      console.warn('Failed to save to history:', e);
    }
  }

  function updateHistoryBadge() {
    try {
      const list = getHistory();
      if (historyCountBadge) {
        if (list.length > 0) {
          historyCountBadge.textContent = list.length;
          historyCountBadge.classList.remove('hidden');
        } else {
          historyCountBadge.classList.add('hidden');
        }
      }
    } catch (e) {}
  }

  // DOM Elements
  const tabLinkBtn = document.getElementById('tabLinkBtn');
  const tabUploadBtn = document.getElementById('tabUploadBtn');
  const tabPresetBtn = document.getElementById('tabPresetBtn');
  const tabLinkContent = document.getElementById('tabLinkContent');
  const tabUploadContent = document.getElementById('tabUploadContent');
  const tabPresetContent = document.getElementById('tabPresetContent');

  const urlForm = document.getElementById('urlForm');
  const tweetUrlInput = document.getElementById('tweetUrlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const fetchBtn = document.getElementById('fetchBtn');
  const quickTryBtn = document.getElementById('quickTryBtn');

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  const sampleCardsContainer = document.getElementById('sampleCardsContainer');

  const errorAlert = document.getElementById('errorAlert');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const closeErrorBtn = document.getElementById('closeErrorBtn');

  const studioSection = document.getElementById('studioSection');
  const mediaTitleDisplay = document.getElementById('mediaTitleDisplay');
  const mediaAuthorDisplay = document.getElementById('mediaAuthorDisplay');
  const durationDisplay = document.getElementById('durationDisplay');
  const resetMediaBtn = document.getElementById('resetMediaBtn');

  // Preview elements
  const previewContainer = document.getElementById('previewContainer');
  const directVideoWrapper = document.getElementById('directVideoWrapper');
  const chatBubble = document.getElementById('chatBubble');
  const sourceVideoDirect = document.getElementById('sourceVideoDirect');
  const sourceVideoBubble = document.getElementById('sourceVideoBubble');
  const sourceImgDirect = document.getElementById('sourceImgDirect');
  const sourceImgBubble = document.getElementById('sourceImgBubble');

  const bgCheckerBtn = document.getElementById('bgCheckerBtn');
  const bgDarkChatBtn = document.getElementById('bgDarkChatBtn');
  const bgLightChatBtn = document.getElementById('bgLightChatBtn');

  // Sliders & Controls
  const trimStartSlider = document.getElementById('trimStartSlider');
  const trimDurationSlider = document.getElementById('trimDurationSlider');
  const trimStartVal = document.getElementById('trimStartVal');
  const trimDurationVal = document.getElementById('trimDurationVal');
  const trimStartLabel = document.getElementById('trimStartLabel');
  const trimEndLabel = document.getElementById('trimEndLabel');
  const trimDurationLabel = document.getElementById('trimDurationLabel');

  const fitModePad = document.getElementById('fitModePad');
  const fitModeCrop = document.getElementById('fitModeCrop');

  const toggleMetaBtn = document.getElementById('toggleMetaBtn');
  const metaChevron = document.getElementById('metaChevron');
  const metaFields = document.getElementById('metaFields');
  const metaPackName = document.getElementById('metaPackName');
  const metaAuthor = document.getElementById('metaAuthor');
  const metaEmojis = document.getElementById('metaEmojis');

  const convertBtn = document.getElementById('convertBtn');
  const conversionProgress = document.getElementById('conversionProgress');
  const progressStatusText = document.getElementById('progressStatusText');

  // Result Section Elements
  const resultSection = document.getElementById('resultSection');
  const finalStickerImg = document.getElementById('finalStickerImg');
  const finalSizeBadge = document.getElementById('finalSizeBadge');
  const downloadStickerBtn = document.getElementById('downloadStickerBtn');
  const downloadPackBtn = document.getElementById('downloadPackBtn');
  const copyStickerClipboardBtn = document.getElementById('copyStickerClipboardBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  const tabSendWeb = document.getElementById('tabSendWeb');
  const tabSendMobile = document.getElementById('tabSendMobile');
  const panelSendWeb = document.getElementById('panelSendWeb');
  const panelSendMobile = document.getElementById('panelSendMobile');
  const showQrBtn = document.getElementById('showQrBtn');

  // Switch between Web and Mobile tabs in result section
  if (tabSendWeb && tabSendMobile) {
    tabSendWeb.addEventListener('click', () => {
      tabSendWeb.classList.add('bg-slate-800', 'text-white');
      tabSendWeb.classList.remove('text-slate-400');
      tabSendMobile.classList.remove('bg-slate-800', 'text-white');
      tabSendMobile.classList.add('text-slate-400');
      panelSendWeb.classList.remove('hidden');
      panelSendMobile.classList.add('hidden');
    });

    tabSendMobile.addEventListener('click', () => {
      tabSendMobile.classList.add('bg-slate-800', 'text-white');
      tabSendMobile.classList.remove('text-slate-400');
      tabSendWeb.classList.remove('bg-slate-800', 'text-white');
      tabSendWeb.classList.add('text-slate-400');
      panelSendMobile.classList.remove('hidden');
      panelSendWeb.classList.add('hidden');
    });
  }

  // Copy Sticker to Clipboard for WhatsApp Web (Ctrl+V)
  if (copyStickerClipboardBtn) {
    copyStickerClipboardBtn.addEventListener('click', async () => {
      if (!state.lastResult) return;
      
      const originalText = copyBtnText.textContent;
      copyBtnText.textContent = 'Copying Sticker...';

      try {
        // Draw the current sticker onto an offscreen canvas and convert to PNG blob for clipboard
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = state.lastResult.url;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 512);
        ctx.drawImage(img, 0, 0, 512, 512);

        canvas.toBlob(async (blob) => {
          if (!blob) throw new Error('Could not render sticker blob');
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);

          copyBtnText.textContent = 'Copied! Press Ctrl+V in WhatsApp';
          copyStickerClipboardBtn.classList.add('ring-2', 'ring-white');

          setTimeout(() => {
            copyBtnText.textContent = originalText;
            copyStickerClipboardBtn.classList.remove('ring-2', 'ring-white');
          }, 3500);
        }, 'image/png');

      } catch (err) {
        console.error('Clipboard copy error:', err);
        // Fallback: Copy direct sticker link
        const fullStickerUrl = `${window.location.origin}${state.lastResult.url}`;
        navigator.clipboard.writeText(fullStickerUrl);
        copyBtnText.textContent = 'Link Copied! Open WhatsApp Web';
        setTimeout(() => copyBtnText.textContent = originalText, 3000);
      }
    });
  }

  // Network Access Modal Elements
  const networkAccessBtn = document.getElementById('networkAccessBtn');
  const networkModal = document.getElementById('networkModal');
  const networkQrBox = document.getElementById('networkQrBox');
  const networkAddressesList = document.getElementById('networkAddressesList');
  const closeNetworkModal = document.getElementById('closeNetworkModal');
  const doneNetworkBtn = document.getElementById('doneNetworkBtn');

  // Load and show Network Access
  async function openNetworkModal() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      const primaryUrl = data.primaryUrl || window.location.href;

      // Render QR Code
      networkQrBox.innerHTML = '';
      new QRCode(networkQrBox, {
        text: primaryUrl,
        width: 170,
        height: 170,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });

      // Render Addresses List
      networkAddressesList.innerHTML = '';

      const addresses = data.networkAddresses || [];
      if (addresses.length === 0) {
        addresses.push({ interface: 'Local', ip: window.location.hostname, url: window.location.href });
      }

      addresses.forEach(addr => {
        const item = document.createElement('div');
        item.className = 'p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-2';
        item.innerHTML = `
          <div class="truncate">
            <span class="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">${addr.interface}</span>
            <span class="text-xs font-mono font-medium text-emerald-400 select-all">${addr.url}</span>
          </div>
          <button type="button" class="copy-url-btn px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 shrink-0">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy</span>
          </button>
        `;

        const copyBtn = item.querySelector('.copy-url-btn');
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(addr.url);
          copyBtn.innerHTML = `<span>Copied!</span>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<i data-lucide="copy" class="w-3.5 h-3.5"></i><span>Copy</span>`;
            if (window.lucide) window.lucide.createIcons();
          }, 2000);
        });

        networkAddressesList.appendChild(item);
      });

      networkModal.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error('Failed to load network info:', e);
    }
  }

  if (networkAccessBtn) {
    networkAccessBtn.addEventListener('click', openNetworkModal);
  }
  if (closeNetworkModal) {
    closeNetworkModal.addEventListener('click', () => networkModal.classList.add('hidden'));
  }
  if (doneNetworkBtn) {
    doneNetworkBtn.addEventListener('click', () => networkModal.classList.add('hidden'));
  }

  // QR Modal
  const qrModal = document.getElementById('qrModal');
  const qrcodeBox = document.getElementById('qrcodeBox');
  const closeQrModal = document.getElementById('closeQrModal');
  const doneQrBtn = document.getElementById('doneQrBtn');

  // History Modal
  const viewHistoryBtn = document.getElementById('viewHistoryBtn');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const historyModal = document.getElementById('historyModal');
  const historyList = document.getElementById('historyList');
  const closeHistoryModal = document.getElementById('closeHistoryModal');
  const closeHistoryBtn2 = document.getElementById('closeHistoryBtn2');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // ================= TAB MANAGEMENT =================
  function switchTab(activeTab) {
    [tabLinkBtn, tabUploadBtn, tabPresetBtn].forEach(btn => {
      btn.classList.remove('bg-slate-800', 'text-[#25D366]');
      btn.classList.add('text-slate-400');
    });

    tabLinkContent.classList.add('hidden');
    tabUploadContent.classList.add('hidden');
    tabPresetContent.classList.add('hidden');

    if (activeTab === 'link') {
      tabLinkBtn.classList.add('bg-slate-800', 'text-[#25D366]');
      tabLinkBtn.classList.remove('text-slate-400');
      tabLinkContent.classList.remove('hidden');
    } else if (activeTab === 'upload') {
      tabUploadBtn.classList.add('bg-slate-800', 'text-[#25D366]');
      tabUploadBtn.classList.remove('text-slate-400');
      tabUploadContent.classList.remove('hidden');
    } else if (activeTab === 'preset') {
      tabPresetBtn.classList.add('bg-slate-800', 'text-[#25D366]');
      tabPresetBtn.classList.remove('text-slate-400');
      tabPresetContent.classList.remove('hidden');
      loadSamplePresets();
    }
  }

  tabLinkBtn.addEventListener('click', () => switchTab('link'));
  tabUploadBtn.addEventListener('click', () => switchTab('upload'));
  tabPresetBtn.addEventListener('click', () => switchTab('preset'));
  quickTryBtn.addEventListener('click', () => switchTab('preset'));

  // Paste from clipboard helper
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        tweetUrlInput.value = text.trim();
        tweetUrlInput.focus();
      }
    } catch (err) {
      tweetUrlInput.focus();
    }
  });

  // ================= ERROR HANDLING =================
  function showError(title, msg) {
    errorTitle.textContent = title;
    errorMessage.textContent = msg;
    errorAlert.classList.remove('hidden');
    errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorAlert.classList.add('hidden');
  }

  closeErrorBtn.addEventListener('click', hideError);

  // ================= URL FORM SUBMISSION =================
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    const url = tweetUrlInput.value.trim();
    if (!url) return;

    fetchBtn.disabled = true;
    fetchBtn.innerHTML = `
      <div class="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
      <span>Extracting...</span>
    `;

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract video/GIF from link');
      }

      state.currentSourceType = 'url';
      state.videoUrl = data.videoUrl;
      state.localFile = null;
      state.mediaMetadata = data;

      loadMediaIntoStudio(data.videoUrl, data.title, data.author);
    } catch (err) {
      showError('Tweet Extraction Error', err.message);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.innerHTML = `
        <i data-lucide="arrow-right" class="w-4 h-4"></i>
        <span>Load Media</span>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // ================= FILE UPLOAD =================
  dropZone.addEventListener('click', () => fileInput.click());
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-[#25D366]', 'bg-[#25D366]/5');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-[#25D366]', 'bg-[#25D366]/5');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-[#25D366]', 'bg-[#25D366]/5');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    hideError();
    if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
      return showError('Unsupported File', 'Please upload a video (.mp4, .webm, .mov) or animated GIF.');
    }

    state.currentSourceType = 'file';
    state.localFile = file;
    state.videoUrl = URL.createObjectURL(file);
    state.mediaMetadata = {
      title: file.name,
      author: 'Local File'
    };

    loadMediaIntoStudio(state.videoUrl, file.name, 'Uploaded File');
  }

  // ================= SAMPLE PRESETS =================
  async function loadSamplePresets() {
    if (sampleCardsContainer.children.length > 0) return; // already loaded
    try {
      const res = await fetch('/api/samples');
      const { samples } = await res.json();

      sampleCardsContainer.innerHTML = '';
      samples.forEach(sample => {
        const isGif = sample.url.toLowerCase().endsWith('.gif');
        const mediaHtml = isGif
          ? `<img src="${sample.url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${sample.title}">`
          : `<video src="${sample.url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" muted loop playsinline></video>`;

        const card = document.createElement('div');
        card.className = 'bg-slate-950 p-2.5 rounded-xl border border-slate-800 hover:border-[#25D366] transition cursor-pointer group flex flex-col justify-between';
        card.innerHTML = `
          <div class="w-full aspect-video rounded-lg overflow-hidden bg-slate-900 mb-2 relative flex items-center justify-center">
            ${mediaHtml}
            <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-emerald-400">
              ${sample.badge}
            </span>
          </div>
          <div>
            <h4 class="text-xs font-semibold text-slate-200 group-hover:text-[#25D366] transition truncate">${sample.title}</h4>
            <span class="text-[10px] text-slate-500">${sample.author}</span>
          </div>
        `;

        // Video hover preview (if video)
        const vid = card.querySelector('video');
        if (vid) {
          card.addEventListener('mouseenter', () => vid.play().catch(() => {}));
          card.addEventListener('mouseleave', () => vid.pause());
        }

        // Card click to load
        card.addEventListener('click', () => {
          hideError();
          state.currentSourceType = 'sample';
          state.videoUrl = sample.url;
          state.localFile = null;
          state.mediaMetadata = {
            title: sample.title,
            author: sample.author
          };
          loadMediaIntoStudio(sample.url, sample.title, sample.author);
        });

        sampleCardsContainer.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load samples:', err);
    }
  }

  // ================= STUDIO & VIDEO CONTROLS =================
  function loadMediaIntoStudio(url, title, author) {
    mediaTitleDisplay.textContent = title || 'Tweet Video';
    mediaAuthorDisplay.textContent = `${author || 'Twitter User'} • 512x512 Ready`;

    const isGifOrImg = url.match(/\.(gif|webp|png|jpe?g)(\?.*)?$/i) || (state.localFile && state.localFile.type.startsWith('image/'));

    if (isGifOrImg) {
      // Show image preview elements, hide video preview elements
      sourceVideoDirect.classList.add('hidden');
      sourceVideoBubble.classList.add('hidden');
      sourceImgDirect.classList.remove('hidden');
      sourceImgBubble.classList.remove('hidden');

      sourceImgDirect.src = url;
      sourceImgBubble.src = url;

      durationDisplay.textContent = 'Animated GIF Loop';
      trimStartSlider.disabled = true;
      trimDurationSlider.disabled = true;
      trimStartSlider.classList.add('opacity-40');
      trimDurationSlider.classList.add('opacity-40');
      trimStartVal.textContent = '0.0s';
      trimDurationVal.textContent = 'Full';
      trimStartLabel.textContent = '0.0s';
      trimEndLabel.textContent = 'End';
      trimDurationLabel.textContent = 'Full Loop';
    } else {
      // Show video preview elements, hide image preview elements
      sourceImgDirect.classList.add('hidden');
      sourceImgBubble.classList.add('hidden');
      sourceVideoDirect.classList.remove('hidden');
      sourceVideoBubble.classList.remove('hidden');

      trimStartSlider.disabled = false;
      trimDurationSlider.disabled = false;
      trimStartSlider.classList.remove('opacity-40');
      trimDurationSlider.classList.remove('opacity-40');

      sourceVideoDirect.muted = true;
      sourceVideoBubble.muted = true;
      sourceVideoDirect.playsInline = true;
      sourceVideoBubble.playsInline = true;

      // Load into preview videos
      sourceVideoDirect.src = url;
      sourceVideoBubble.src = url;

      sourceVideoDirect.playbackRate = state.speed;
      sourceVideoBubble.playbackRate = state.speed;

      sourceVideoDirect.play().catch(e => console.log('Autoplay handled:', e));
      sourceVideoBubble.play().catch(e => console.log('Autoplay handled:', e));

      // Wait for video metadata
      const onMeta = () => {
        const dur = sourceVideoDirect.duration || 3.0;
        state.duration = dur;
        
        durationDisplay.textContent = `${dur.toFixed(1)}s`;

        // Set sliders
        trimStartSlider.max = Math.max(0, dur - 0.5).toFixed(1);
        trimStartSlider.value = 0;
        state.startTime = 0;

        const safeDur = Math.min(3.5, dur);
        trimDurationSlider.max = Math.min(5.0, dur).toFixed(1);
        trimDurationSlider.value = safeDur.toFixed(1);
        state.trimDuration = safeDur;

        updateTrimLabels();

        sourceVideoDirect.removeEventListener('loadedmetadata', onMeta);
      };

      sourceVideoDirect.addEventListener('loadedmetadata', onMeta);
    }

    // Show Studio Section
    studioSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    studioSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (window.lucide) window.lucide.createIcons();
  }

  // Synchronized Trimmer Looper
  function enforceLoop(video) {
    video.addEventListener('timeupdate', () => {
      const loopEnd = state.startTime + state.trimDuration;
      if (video.currentTime >= loopEnd || video.currentTime < state.startTime) {
        video.currentTime = state.startTime;
      }
    });
  }
  enforceLoop(sourceVideoDirect);
  enforceLoop(sourceVideoBubble);

  // Update Trim Labels
  function updateTrimLabels() {
    const start = parseFloat(trimStartSlider.value);
    const len = parseFloat(trimDurationSlider.value);
    const end = (start + len).toFixed(1);

    state.startTime = start;
    state.trimDuration = len;

    trimStartVal.textContent = `${start.toFixed(1)}s`;
    trimDurationVal.textContent = `${len.toFixed(1)}s`;

    trimStartLabel.textContent = `${start.toFixed(1)}s`;
    trimEndLabel.textContent = `${end}s`;
    trimDurationLabel.textContent = `${len.toFixed(1)}s`;

    sourceVideoDirect.currentTime = start;
    sourceVideoBubble.currentTime = start;
  }

  trimStartSlider.addEventListener('input', updateTrimLabels);
  trimDurationSlider.addEventListener('input', updateTrimLabels);

  // Fit Mode Toggle
  fitModePad.addEventListener('click', () => {
    state.fitMode = 'fit';
    fitModePad.classList.add('border-[#25D366]', 'bg-emerald-500/10');
    fitModePad.classList.remove('border-slate-800', 'bg-slate-950');

    fitModeCrop.classList.remove('border-[#25D366]', 'bg-emerald-500/10');
    fitModeCrop.classList.add('border-slate-800', 'bg-slate-950');

    [sourceVideoDirect, sourceVideoBubble, sourceImgDirect, sourceImgBubble].forEach(el => {
      if (el) el.style.objectFit = 'contain';
    });
  });

  fitModeCrop.addEventListener('click', () => {
    state.fitMode = 'crop';
    fitModeCrop.classList.add('border-[#25D366]', 'bg-emerald-500/10');
    fitModeCrop.classList.remove('border-slate-800', 'bg-slate-950');

    fitModePad.classList.remove('border-[#25D366]', 'bg-emerald-500/10');
    fitModePad.classList.add('border-slate-800', 'bg-slate-950');

    [sourceVideoDirect, sourceVideoBubble, sourceImgDirect, sourceImgBubble].forEach(el => {
      if (el) el.style.objectFit = 'cover';
    });
  });

  // Speed selection
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => {
        b.classList.remove('bg-slate-800', 'text-white', 'font-semibold');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-slate-800', 'text-white', 'font-semibold');
      btn.classList.remove('text-slate-400');

      const spd = parseFloat(btn.dataset.speed);
      state.speed = spd;
      sourceVideoDirect.playbackRate = spd;
      sourceVideoBubble.playbackRate = spd;
    });
  });

  // FPS selection
  document.querySelectorAll('.fps-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fps-btn').forEach(b => {
        b.classList.remove('bg-emerald-500/20', 'border', 'border-emerald-500/30', 'text-emerald-300', 'font-semibold');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-emerald-500/20', 'border', 'border-emerald-500/30', 'text-emerald-300', 'font-semibold');
      btn.classList.remove('text-slate-400');

      state.fps = parseInt(btn.dataset.fps, 10);
    });
  });

  // Background Theme Switcher
  bgCheckerBtn.addEventListener('click', () => {
    setActiveBgBtn(bgCheckerBtn);
    previewContainer.className = 'preview-box w-full max-w-[360px] aspect-square rounded-2xl flex items-center justify-center relative overflow-hidden shadow-2xl checkerboard-bg';
    directVideoWrapper.classList.remove('hidden');
    chatBubble.classList.add('hidden');
    if (!sourceVideoDirect.classList.contains('hidden')) {
      sourceVideoDirect.currentTime = sourceVideoBubble.currentTime;
      sourceVideoDirect.play().catch(() => {});
    }
  });

  bgDarkChatBtn.addEventListener('click', () => {
    setActiveBgBtn(bgDarkChatBtn);
    previewContainer.className = 'preview-box w-full max-w-[360px] aspect-square rounded-2xl flex items-center justify-center relative overflow-hidden shadow-2xl wa-dark-theme';
    directVideoWrapper.classList.add('hidden');
    chatBubble.classList.remove('hidden');
    if (!sourceVideoBubble.classList.contains('hidden')) {
      sourceVideoBubble.currentTime = sourceVideoDirect.currentTime;
      sourceVideoBubble.play().catch(() => {});
    }
  });

  bgLightChatBtn.addEventListener('click', () => {
    setActiveBgBtn(bgLightChatBtn);
    previewContainer.className = 'preview-box w-full max-w-[360px] aspect-square rounded-2xl flex items-center justify-center relative overflow-hidden shadow-2xl wa-light-theme';
    directVideoWrapper.classList.add('hidden');
    chatBubble.classList.remove('hidden');
    if (!sourceVideoBubble.classList.contains('hidden')) {
      sourceVideoBubble.currentTime = sourceVideoDirect.currentTime;
      sourceVideoBubble.play().catch(() => {});
    }
  });

  function setActiveBgBtn(activeBtn) {
    [bgCheckerBtn, bgDarkChatBtn, bgLightChatBtn].forEach(b => {
      b.classList.remove('bg-slate-800', 'text-white', 'font-medium');
      b.classList.add('text-slate-400');
    });
    activeBtn.classList.add('bg-slate-800', 'text-white', 'font-medium');
    activeBtn.classList.remove('text-slate-400');
  }

  // Metadata Toggle
  toggleMetaBtn.addEventListener('click', () => {
    const isHidden = metaFields.classList.contains('hidden');
    if (isHidden) {
      metaFields.classList.remove('hidden');
      metaChevron.classList.add('rotate-180');
    } else {
      metaFields.classList.add('hidden');
      metaChevron.classList.remove('rotate-180');
    }
  });

  resetMediaBtn.addEventListener('click', () => {
    studioSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ================= CONVERT PROCESS =================
  convertBtn.addEventListener('click', async () => {
    hideError();
    convertBtn.disabled = true;
    convertBtn.classList.add('opacity-50', 'pointer-events-none');
    conversionProgress.classList.remove('hidden');

    progressStatusText.textContent = 'Formatting to 512x512 WebP & compressing...';

    const formData = new FormData();
    formData.append('startTime', state.startTime);
    formData.append('duration', state.trimDuration);
    formData.append('fps', state.fps);
    formData.append('fitMode', state.fitMode);
    formData.append('speed', state.speed);
    formData.append('packName', metaPackName.value.trim() || 'Twitter Sticker');
    formData.append('author', metaAuthor.value.trim() || 'Twitter Sticker Maker');
    formData.append('emojis', metaEmojis.value.trim() || '😂, 🔥');

    if (state.currentSourceType === 'file' && state.localFile) {
      formData.append('mediaFile', state.localFile);
    } else {
      formData.append('videoUrl', state.videoUrl);
    }

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to convert media to WhatsApp sticker');
      }

      state.lastResult = data;
      displayResult(data);
      saveToHistory(data);
    } catch (err) {
      showError('Conversion Failed', err.message);
    } finally {
      convertBtn.disabled = false;
      convertBtn.classList.remove('opacity-50', 'pointer-events-none');
      conversionProgress.classList.add('hidden');
    }
  });

  const downloadStickerBtnMobile = document.getElementById('downloadStickerBtnMobile');

  function displayResult(result) {
    // Add cache buster so animated WebP always restarts freshly
    finalStickerImg.src = `${result.url}?t=${Date.now()}`;
    finalSizeBadge.textContent = `${result.sizeKb} KB`;

    downloadStickerBtn.href = result.downloadUrl;
    downloadStickerBtn.setAttribute('download', `whatsapp-sticker-${result.stickerId.slice(0, 8)}.webp`);

    if (downloadStickerBtnMobile) {
      downloadStickerBtnMobile.href = result.downloadUrl;
      downloadStickerBtnMobile.setAttribute('download', `whatsapp-sticker-${result.stickerId.slice(0, 8)}.webp`);
    }

    if (downloadPackBtn && result.packUrl) {
      downloadPackBtn.href = result.packUrl;
      downloadPackBtn.setAttribute('download', `whatsapp-sticker-pack-${result.stickerId.slice(0, 8)}.wastickers`);
    }

    // Auto-select Mobile tab if on Android or mobile device
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && tabSendMobile) {
      tabSendMobile.click();
    }

    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (window.lucide) window.lucide.createIcons();
  }

  // ================= WHATSAPP INTEGRATION & QR =================
  showQrBtn.addEventListener('click', () => {
    if (!state.lastResult) return;
    const fullStickerUrl = `${window.location.origin}${state.lastResult.url}`;
    
    qrcodeBox.innerHTML = '';
    new QRCode(qrcodeBox, {
      text: fullStickerUrl,
      width: 190,
      height: 190,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    qrModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  });

  closeQrModal.addEventListener('click', () => qrModal.classList.add('hidden'));
  doneQrBtn.addEventListener('click', () => qrModal.classList.add('hidden'));

  shareWaBtn.addEventListener('click', async () => {
    if (!state.lastResult) return;
    const fullStickerUrl = `${window.location.origin}${state.lastResult.url}`;

    // If mobile Web Share API is available with files support
    if (navigator.share) {
      try {
        const response = await fetch(state.lastResult.url);
        const blob = await response.blob();
        const file = new File([blob], 'sticker.webp', { type: 'image/webp' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'WhatsApp Sticker',
            text: 'Here is your custom Twitter sticker!'
          });
          return;
        }
      } catch (e) {
        console.log('Native file share skipped or cancelled');
      }
    }

    // Fallback: Open WhatsApp with sticker download link
    const waUrl = `https://wa.me/?text=${encodeURIComponent(`Check out my custom sticker: ${fullStickerUrl}`)}`;
    window.open(waUrl, '_blank');
  });

  // ================= STICKER HISTORY MODAL HANDLERS =================
  viewHistoryBtn.addEventListener('click', () => {
    renderHistoryModal();
    historyModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  });

  closeHistoryModal.addEventListener('click', () => historyModal.classList.add('hidden'));
  closeHistoryBtn2.addEventListener('click', () => historyModal.classList.add('hidden'));

  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    renderHistoryModal();
    updateHistoryBadge();
  });

  function renderHistoryModal() {
    const list = getHistory();
    if (list.length === 0) {
      historyList.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-xs">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-600"></i>
          <p>No converted stickers yet. Create your first one!</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = '';
    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3';
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-slate-900 border border-slate-700 checkerboard-bg p-1 flex items-center justify-center shrink-0">
            <img src="${item.url}" class="w-full h-full object-contain">
          </div>
          <div>
            <h4 class="text-xs font-semibold text-white truncate max-w-[200px]">${item.packName}</h4>
            <span class="text-[10px] text-emerald-400 font-mono">${item.sizeKb} KB • 512x512 WebP</span>
          </div>
        </div>
        <a href="${item.downloadUrl}" download class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-[#25D366] hover:text-slate-950 text-slate-200 text-xs font-medium transition flex items-center gap-1.5">
          <i data-lucide="download" class="w-3.5 h-3.5"></i>
          <span>Save</span>
        </a>
      `;
      historyList.appendChild(row);
    });
  }

  // Initial setup
  updateHistoryBadge();

  // ----------------------------------------------------
  // Native TwitSticker Android App Integration
  // ----------------------------------------------------
  const isNative = typeof window.TwitStickerNative !== 'undefined';
  const nativeImportBox = document.getElementById('nativeImportBox');
  const nativeAddToWhatsAppBtn = document.getElementById('nativeAddToWhatsAppBtn');

  if (isNative && nativeImportBox) {
    nativeImportBox.classList.remove('hidden');
    // Hide third-party fallback button in app mode
    const playStoreBtn = document.getElementById('playStoreBtn');
    if (playStoreBtn) {
      playStoreBtn.classList.add('hidden');
    }
  }

  if (nativeAddToWhatsAppBtn) {
    nativeAddToWhatsAppBtn.addEventListener('click', () => {
      if (!state.lastResult) return;
      const stickerId = state.lastResult.stickerId;
      const packName = state.lastResult.metadata?.packName || 'TwitSticker Pack';
      const author = state.lastResult.metadata?.author || 'TwitSticker App';
      const stickerUrl = state.lastResult.url;
      const emojis = state.lastResult.metadata?.emojis || ['🔥', '✨'];

      if (window.TwitStickerNative && window.TwitStickerNative.addStickerToWhatsApp) {
        window.TwitStickerNative.addStickerToWhatsApp(
          stickerId,
          packName,
          author,
          stickerUrl,
          JSON.stringify(emojis)
        );
      }
    });
  }

  // Handle Shared Tweet URL from Android System Share Sheet
  window.handleSharedUrl = function(sharedUrl) {
    if (!sharedUrl) return;
    if (tweetUrlInput) {
      tweetUrlInput.value = sharedUrl;
      if (tabLinkBtn) tabLinkBtn.click();
      if (fetchBtn) fetchBtn.click();
    }
  };
});

