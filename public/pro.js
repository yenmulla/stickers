// TwitSticker Pro — Firebase Auth + Paystack Checkout & Subscriptions
(function () {
  const PRO_HINT_KEY = 'twitsticker_is_pro_v1';

  const DEFAULT_PLANS = [
    { id: 'monthly', label: '1 Month', price: '$1.49' },
    { id: '6months', label: '6 Months', price: '$6' },
    { id: 'yearly', label: '1 Year', price: '$10' }
  ];

  const proState = {
    config: null,
    firebaseInitialized: false,
    user: null,
    isPro: localStorage.getItem(PRO_HINT_KEY) === '1',
    plan: 'free',
    hasSubscriptionManage: false,
    selectedPlanId: 'yearly',
    quota: { isPro: false, limit: 4, used: 0, remaining: 4 },
    listeners: []
  };

  function applyAdFreeMode(isPro) {
    try {
      localStorage.setItem(PRO_HINT_KEY, isPro ? '1' : '0');
    } catch (e) {}

    document.documentElement.classList.toggle('twit-pro-active', isPro);
    document.querySelectorAll('.ad-slot-wrapper').forEach(el => {
      if (isPro) {
        el.classList.add('hidden');
        el.style.display = 'none';
      } else {
        el.classList.remove('hidden');
        el.style.display = '';
      }
    });
  }

  function notifyListeners() {
    applyAdFreeMode(proState.isPro);
    renderProUi();
    renderQuotaBar();
    proState.listeners.forEach(fn => {
      try { fn(proState); } catch (e) {}
    });
  }

  async function getIdToken(forceRefresh = false) {
    if (!proState.user) return null;
    try {
      return await proState.user.getIdToken(forceRefresh);
    } catch (e) {
      return null;
    }
  }

  async function getAuthHeaders() {
    const token = await getIdToken(false);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchQuota() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/quota', { headers });
      if (res.ok) {
        proState.quota = await res.json();
      }
    } catch (e) {}
    renderQuotaBar();
  }

  function updateQuota(quota) {
    if (!quota) return;
    proState.quota = quota;
    renderQuotaBar();
  }

  function renderQuotaBar() {
    const bar = document.getElementById('dailyQuotaBar');
    const text = document.getElementById('dailyQuotaText');
    const btn = document.getElementById('quotaUpgradeBtn');
    if (!bar || !text) return;

    const q = proState.quota || { isPro: proState.isPro, limit: 4, used: 0, remaining: 4 };
    if (proState.isPro || q.isPro) {
      bar.className = 'px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-xs';
      text.innerHTML = '<span class="text-amber-300 font-semibold">PRO Plan: Unlimited stickers every day</span>';
      if (btn) btn.classList.add('hidden');
      return;
    }

    if (btn) btn.classList.remove('hidden');
    const limit = q.limit || 4;
    const remaining = typeof q.remaining === 'number' ? q.remaining : limit;

    if (remaining <= 0) {
      bar.className = 'px-3.5 py-2.5 rounded-xl bg-red-950/60 border border-red-500/40 flex items-center justify-between gap-2 text-xs';
      text.innerHTML = `<span class="text-red-300">Daily limit reached (<strong>0 / ${limit}</strong> free stickers left today)</span>`;
    } else if (remaining === 1) {
      bar.className = 'px-3.5 py-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-between gap-2 text-xs';
      text.innerHTML = `<span class="text-amber-200">Free Plan: <strong>1 / ${limit}</strong> sticker left today</span>`;
    } else {
      bar.className = 'px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2 text-xs';
      text.innerHTML = `Free Plan: <strong class="text-emerald-400">${remaining} / ${limit}</strong> stickers left today`;
    }
  }

  async function syncAccountStatus(forceTokenRefresh = false) {
    if (!proState.user) {
      proState.isPro = false;
      proState.plan = 'free';
      proState.hasSubscriptionManage = false;
      await fetchQuota();
      notifyListeners();
      return;
    }

    try {
      const token = await getIdToken(forceTokenRefresh);
      if (!token) return;
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const prevPro = proState.isPro;
        proState.isPro = Boolean(data.isPro);
        proState.plan = data.plan || 'free';
        proState.hasSubscriptionManage = Boolean(data.hasSubscriptionManage);
        if (proState.isPro !== prevPro && !forceTokenRefresh) {
          await getIdToken(true);
        }
      }
    } catch (err) {
      console.warn('[TwitPro] Could not sync account status:', err);
    }
    await fetchQuota();
    notifyListeners();
  }

  let welcomeAnimRaf = null;

  function formatPlanDisplayName(planCode) {
    if (!planCode) return 'TwitSticker Pro · Active';
    const p = String(planCode).toLowerCase();
    if (p.includes('year')) return '1 Year Pro · Active';
    if (p.includes('6month')) return '6 Months Pro · Active';
    if (p.includes('month')) return '1 Month Pro · Active';
    return 'TwitSticker Pro · Active';
  }

  function startWelcomeConfetti() {
    const canvas = document.getElementById('proWelcomeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const colors = ['#fbbf24', '#fde68a', '#25D366', '#34d399', '#38bdf8', '#ffffff'];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.42;

    const particles = Array.from({ length: 95 }, (_, idx) => {
      const angle = (Math.PI * 2 * (idx / 95)) + (Math.random() - 0.5) * 0.45;
      const speed = 3.2 + Math.random() * 8.5;
      return {
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (2.2 + Math.random() * 3.5),
        size: 5 + Math.random() * 6,
        color: colors[idx % colors.length],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.22,
        opacity: 1,
        shape: idx % 3 === 0 ? 'circle' : 'ribbon'
      };
    });

    const startTime = performance.now();
    const durationMs = 3800;

    if (welcomeAnimRaf) cancelAnimationFrame(welcomeAnimRaf);

    function frame(now) {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      let alive = 0;
      for (const p of particles) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.14; // gentle gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        if (elapsed > 1800) {
          p.opacity = Math.max(0, 1 - (elapsed - 1800) / (durationMs - 1800));
        }

        if (p.opacity > 0.01 && p.y < window.innerHeight + 30) {
          alive++;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.55);
          }
          ctx.restore();
        }
      }

      if (alive > 0 && elapsed < durationMs) {
        welcomeAnimRaf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        welcomeAnimRaf = null;
      }
    }

    welcomeAnimRaf = requestAnimationFrame(frame);
  }

  function showWelcomeAnimation(planName) {
    const overlay = document.getElementById('proWelcomeOverlay');
    if (!overlay) return;
    const planLabel = document.getElementById('proWelcomePlanLabel');
    if (planLabel) {
      planLabel.textContent = formatPlanDisplayName(planName || proState.plan);
    }

    // Re-trigger staggered perk animations cleanly
    overlay.querySelectorAll('.pro-welcome-perk').forEach(el => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });

    closeModal('proUpgradeModal');
    overlay.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    startWelcomeConfetti();
  }

  function closeWelcomeAnimation() {
    if (welcomeAnimRaf) {
      cancelAnimationFrame(welcomeAnimRaf);
      welcomeAnimRaf = null;
    }
    closeModal('proWelcomeOverlay');
  }

  // Handle redirect back from Paystack (?pro=paystack&reference=...)
  async function handlePaystackReturnParams() {
    const params = new URLSearchParams(window.location.search);
    const proFlag = params.get('pro');
    const reference = params.get('reference') || params.get('trxref');
    if (proFlag !== 'paystack' || !reference) return;

    // Clean URL params so reload doesn't re-verify
    window.history.replaceState({}, '', window.location.pathname);

    if (!proState.user) return;
    try {
      showToast('Verifying your Paystack payment...');
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders())
      };
      const res = await fetch('/api/billing/paystack/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reference })
      });
      const data = await res.json();
      if (res.ok && data.isPro) {
        await syncAccountStatus(true);
        showWelcomeAnimation(data.plan);
      } else {
        showToast(data.error || 'Could not confirm Paystack payment yet. Try Refresh Status.', true);
      }
    } catch (err) {
      console.warn('[TwitPro] Paystack verify error:', err);
      showToast('Error verifying Paystack payment.', true);
    }
  }

  function getSelectedPlan() {
    const plans = (proState.config && Array.isArray(proState.config.plans) && proState.config.plans.length)
      ? proState.config.plans
      : DEFAULT_PLANS;
    return plans.find(p => p.id === proState.selectedPlanId) || plans[plans.length - 1];
  }

  function showToast(msg, isError = false) {
    let toast = document.getElementById('twitProToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'twitProToast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `fixed bottom-5 right-5 z-[100] px-4 py-3 rounded-xl text-xs font-semibold shadow-2xl border transition-all duration-300 ${
      isError
        ? 'bg-red-950/95 border-red-500/40 text-red-200'
        : 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
    }`;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 4500);
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function openAuthModal() {
    const errBox = document.getElementById('authModalError');
    if (errBox) errBox.classList.add('hidden');
    openModal('authModal');
  }

  function openUpgradeModal(reason) {
    const reasonEl = document.getElementById('proUpgradeReason');
    if (reasonEl) {
      if (reason) {
        reasonEl.textContent = reason;
        reasonEl.classList.remove('hidden');
      } else {
        reasonEl.classList.add('hidden');
      }
    }
    const errBox = document.getElementById('paystackCheckoutError');
    if (errBox) errBox.classList.add('hidden');
    renderProUi();
    openModal('proUpgradeModal');
  }

  function renderProUi() {
    const navSignInBtn = document.getElementById('navSignInBtn');
    const navUserMenu = document.getElementById('navUserMenu');
    const navUserEmail = document.getElementById('navUserEmail');
    const navProBadge = document.getElementById('navProBadge');
    const navUpgradeBtn = document.getElementById('navUpgradeBtn');

    if (proState.user) {
      if (navSignInBtn) navSignInBtn.classList.add('hidden');
      if (navUserMenu) navUserMenu.classList.remove('hidden');
      if (navUserEmail) {
        navUserEmail.textContent = proState.user.displayName || proState.user.email || 'Account';
      }
      if (navProBadge) navProBadge.classList.toggle('hidden', !proState.isPro);
      if (navUpgradeBtn) navUpgradeBtn.classList.toggle('hidden', proState.isPro);
    } else {
      if (navSignInBtn) navSignInBtn.classList.remove('hidden');
      if (navUserMenu) navUserMenu.classList.add('hidden');
      if (navUpgradeBtn) navUpgradeBtn.classList.remove('hidden');
    }

    const selectedPlan = getSelectedPlan();
    const checkoutBtnLabel = document.getElementById('paystackCheckoutBtnLabel');
    if (checkoutBtnLabel && selectedPlan) {
      checkoutBtnLabel.textContent = `Get ${selectedPlan.label} Pro — ${selectedPlan.price}`;
    }

    document.querySelectorAll('.pro-plan-card').forEach(card => {
      const isSelected = card.dataset.planId === proState.selectedPlanId;
      card.classList.toggle('border-2', isSelected);
      card.classList.toggle('border-amber-400', isSelected);
      card.classList.toggle('bg-amber-400/10', isSelected);
      card.classList.toggle('shadow-lg', isSelected);
      card.classList.toggle('shadow-amber-500/10', isSelected);
      card.classList.toggle('border-slate-800', !isSelected);
      card.classList.toggle('bg-slate-950/80', !isSelected);
    });

    const proSignInPrompt = document.getElementById('proSignInPrompt');
    const proActiveBanner = document.getElementById('proActiveBanner');
    const proCheckoutActions = document.getElementById('proCheckoutActions');
    const proPlanSelector = document.getElementById('proPlanSelector');
    const paystackManageBtn = document.getElementById('paystackManageBtn');

    if (proActiveBanner) proActiveBanner.classList.toggle('hidden', !proState.isPro);
    if (proSignInPrompt) proSignInPrompt.classList.toggle('hidden', Boolean(proState.user));
    if (proCheckoutActions) proCheckoutActions.classList.toggle('hidden', proState.isPro);
    if (proPlanSelector) proPlanSelector.classList.toggle('hidden', proState.isPro);
    if (paystackManageBtn) paystackManageBtn.classList.toggle('hidden', !proState.hasSubscriptionManage);

    const metaPackName = document.getElementById('metaPackName');
    const metaAuthor = document.getElementById('metaAuthor');
    const metaProLockNote = document.getElementById('metaProLockNote');
    if (metaPackName && metaAuthor) {
      metaPackName.readOnly = !proState.isPro;
      metaAuthor.readOnly = !proState.isPro;
      metaPackName.classList.toggle('opacity-60', !proState.isPro);
      metaAuthor.classList.toggle('opacity-60', !proState.isPro);
      metaPackName.classList.toggle('cursor-not-allowed', !proState.isPro);
      metaAuthor.classList.toggle('cursor-not-allowed', !proState.isPro);
      if (!proState.isPro) {
        metaPackName.value = 'TwitSticker';
        metaAuthor.value = 'gifsticker.site';
      }
    }
    if (metaProLockNote) {
      metaProLockNote.classList.toggle('hidden', proState.isPro);
    }

    const trimDurationSlider = document.getElementById('trimDurationSlider');
    if (trimDurationSlider) {
      const maxDur = proState.isPro ? 6.0 : 3.5;
      trimDurationSlider.dataset.tierMax = String(maxDur);
      if (parseFloat(trimDurationSlider.max) > maxDur || (proState.isPro && parseFloat(trimDurationSlider.max) === 3.5)) {
        trimDurationSlider.max = String(maxDur);
      }
      if (!proState.isPro && parseFloat(trimDurationSlider.value) > 3.5) {
        trimDurationSlider.value = '3.5';
        trimDurationSlider.dispatchEvent(new Event('input'));
      }
    }

    document.querySelectorAll('.pro-lock-pill').forEach(el => {
      el.classList.toggle('hidden', proState.isPro);
    });

    const proTextInput = document.getElementById('proOverlayText');
    if (proTextInput) {
      proTextInput.disabled = !proState.isPro;
      proTextInput.placeholder = proState.isPro
        ? 'e.g. WHEN IT WORKS FIRST TRY'
        : 'Upgrade to Pro to add meme captions...';
    }
  }

  function wireUiHandlers() {
    document.getElementById('navSignInBtn')?.addEventListener('click', openAuthModal);
    document.getElementById('navUpgradeBtn')?.addEventListener('click', () => openUpgradeModal());
    document.getElementById('navSignOutBtn')?.addEventListener('click', async () => {
      if (proState.firebaseInitialized && window.firebase && window.firebase.auth) {
        await window.firebase.auth().signOut();
        showToast('Signed out.');
      }
    });

    document.getElementById('closeAuthModalBtn')?.addEventListener('click', () => closeModal('authModal'));
    document.getElementById('closeProModalBtn')?.addEventListener('click', () => closeModal('proUpgradeModal'));
    document.getElementById('authModalBackdrop')?.addEventListener('click', () => closeModal('authModal'));
    document.getElementById('proModalBackdrop')?.addEventListener('click', () => closeModal('proUpgradeModal'));
    document.getElementById('proWelcomeContinueBtn')?.addEventListener('click', closeWelcomeAnimation);
    document.getElementById('proWelcomeBackdrop')?.addEventListener('click', closeWelcomeAnimation);

    let authMode = 'signin';
    const tabSignIn = document.getElementById('authTabSignIn');
    const tabSignUp = document.getElementById('authTabSignUp');
    const authSubmitBtn = document.getElementById('authEmailSubmitBtn');
    const authErrBox = document.getElementById('authModalError');

    function setAuthError(msg) {
      if (!authErrBox) return;
      if (!msg) {
        authErrBox.classList.add('hidden');
        return;
      }
      authErrBox.textContent = msg;
      authErrBox.classList.remove('hidden');
    }

    function switchAuthTab(mode) {
      authMode = mode;
      setAuthError('');
      if (tabSignIn && tabSignUp && authSubmitBtn) {
        if (mode === 'signin') {
          tabSignIn.className = 'flex-1 py-2 text-xs font-bold rounded-lg bg-slate-800 text-white';
          tabSignUp.className = 'flex-1 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white';
          authSubmitBtn.textContent = 'Sign In with Email';
        } else {
          tabSignUp.className = 'flex-1 py-2 text-xs font-bold rounded-lg bg-slate-800 text-white';
          tabSignIn.className = 'flex-1 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white';
          authSubmitBtn.textContent = 'Create Free Account';
        }
      }
    }

    tabSignIn?.addEventListener('click', () => switchAuthTab('signin'));
    tabSignUp?.addEventListener('click', () => switchAuthTab('signup'));

    document.getElementById('authGoogleBtn')?.addEventListener('click', async () => {
      setAuthError('');
      if (!proState.firebaseInitialized) {
        return setAuthError('Firebase Auth is not configured yet. Add FIREBASE_WEB_* env vars on the server.');
      }
      try {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        await window.firebase.auth().signInWithPopup(provider);
        closeModal('authModal');
        showToast('Signed in with Google!');
      } catch (err) {
        setAuthError(err.message || 'Google sign-in failed.');
      }
    });

    document.getElementById('authEmailForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAuthError('');
      if (!proState.firebaseInitialized) {
        return setAuthError('Firebase Auth is not configured yet. Add FIREBASE_WEB_* env vars on the server.');
      }
      const email = (document.getElementById('authEmailInput')?.value || '').trim();
      const password = document.getElementById('authPasswordInput')?.value || '';
      if (!email || password.length < 6) {
        return setAuthError('Enter a valid email and a password of at least 6 characters.');
      }
      try {
        if (authMode === 'signup') {
          await window.firebase.auth().createUserWithEmailAndPassword(email, password);
          showToast('Account created & signed in!');
        } else {
          await window.firebase.auth().signInWithEmailAndPassword(email, password);
          showToast('Welcome back!');
        }
        closeModal('authModal');
      } catch (err) {
        setAuthError(err.message || 'Authentication failed.');
      }
    });

    document.getElementById('proSignInFirstBtn')?.addEventListener('click', () => {
      closeModal('proUpgradeModal');
      openAuthModal();
    });

    // Plan selector cards (1 Month / 6 Months / 1 Year)
    document.querySelectorAll('.pro-plan-card').forEach(card => {
      card.addEventListener('click', () => {
        proState.selectedPlanId = card.dataset.planId || 'yearly';
        renderProUi();
      });
    });

    // Paystack Checkout button
    document.getElementById('paystackCheckoutBtn')?.addEventListener('click', async () => {
      const errBox = document.getElementById('paystackCheckoutError');
      const btn = document.getElementById('paystackCheckoutBtn');
      const labelEl = document.getElementById('paystackCheckoutBtnLabel');
      if (errBox) errBox.classList.add('hidden');

      if (!proState.user) {
        closeModal('proUpgradeModal');
        openAuthModal();
        showToast('Please sign in first to subscribe with Paystack.');
        return;
      }

      const prevLabel = labelEl ? labelEl.textContent : '';
      try {
        if (btn) btn.disabled = true;
        if (labelEl) labelEl.textContent = 'Opening Paystack...';

        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders())
        };
        const res = await fetch('/api/billing/paystack/initialize', {
          method: 'POST',
          headers,
          body: JSON.stringify({ planId: proState.selectedPlanId })
        });
        const data = await res.json();
        if (!res.ok || !data.authorization_url) {
          throw new Error(data.error || 'Could not start Paystack checkout.');
        }
        window.location.href = data.authorization_url;
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message;
          errBox.classList.remove('hidden');
        }
        if (btn) btn.disabled = false;
        if (labelEl) labelEl.textContent = prevLabel;
      }
    });

    // Paystack Manage Subscription link
    document.getElementById('paystackManageBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('paystackManageBtn');
      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Opening Paystack...';
        }
        const res = await fetch('/api/billing/paystack/manage-link', {
          method: 'POST',
          headers: await getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          throw new Error(data.error || 'Could not open subscription management.');
        }
        window.location.href = data.url;
      } catch (err) {
        showToast(err.message, true);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Manage Subscription on Paystack';
        }
      }
    });

    // Refresh Pro Status button
    document.getElementById('refreshProStatusBtn')?.addEventListener('click', async () => {
      if (!proState.user) return openAuthModal();
      const wasPro = proState.isPro;
      await syncAccountStatus(true);
      if (proState.isPro) {
        if (!wasPro) {
          showWelcomeAnimation(proState.plan);
        } else {
          showToast('Pro status verified!');
          closeModal('proUpgradeModal');
        }
      } else {
        showToast('No active Paystack Pro subscription found yet.', true);
      }
    });

    ['metaPackName', 'metaAuthor'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        if (!proState.isPro) {
          openUpgradeModal('Custom WhatsApp EXIF pack name & author branding is a Pro feature.');
        }
      });
    });

    document.getElementById('quotaUpgradeBtn')?.addEventListener('click', () => {
      openUpgradeModal('Free users can generate up to 4 stickers per day. Upgrade to Pro for unlimited stickers!');
    });
  }

  async function init() {
    applyAdFreeMode(proState.isPro);
    wireUiHandlers();

    try {
      const res = await fetch('/api/config/public');
      if (res.ok) {
        proState.config = await res.json();
      }
    } catch (e) {
      console.warn('[TwitPro] Failed to load public config:', e);
    }

    if (proState.config && proState.config.firebaseConfigured && window.firebase) {
      try {
        if (!window.firebase.apps.length) {
          window.firebase.initializeApp(proState.config.firebase);
        }
        proState.firebaseInitialized = true;
        window.firebase.auth().onAuthStateChanged(async (user) => {
          proState.user = user;
          await syncAccountStatus(false);
          if (user) {
            await handlePaystackReturnParams();
          }
        });
      } catch (err) {
        console.warn('[TwitPro] Firebase Web SDK init error:', err);
      }
    } else {
      proState.isPro = false;
      notifyListeners();
    }

    await fetchQuota();
    renderProUi();
    renderQuotaBar();
  }

  window.TwitPro = {
    isPro: () => Boolean(proState.isPro),
    getUser: () => proState.user,
    getConfig: () => proState.config,
    getAuthHeaders,
    openAuthModal,
    openUpgradeModal,
    showWelcomeAnimation,
    updateQuota,
    fetchQuota,
    onChange: (cb) => {
      if (typeof cb === 'function') proState.listeners.push(cb);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
