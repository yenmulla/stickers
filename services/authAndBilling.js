const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

let firebaseAuth = null;
let firebaseReady = false;

function findLocalServiceAccountFile() {
  const rootDir = path.resolve(__dirname, '..');
  const explicit = path.join(rootDir, 'firebase-service-account.json');
  if (fs.existsSync(explicit)) return explicit;
  try {
    const files = fs.readdirSync(rootDir);
    const match = files.find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
    if (match) return path.join(rootDir, match);
  } catch (e) {}
  return null;
}

function initFirebaseAdmin() {
  if (firebaseReady && firebaseAuth) return true;
  try {
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');

    if (getApps().length > 0) {
      firebaseAuth = getAuth();
      firebaseReady = true;
      return true;
    }

    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || findLocalServiceAccountFile();

    if (rawJson && rawJson.trim()) {
      const trimmed = rawJson.trim();
      const parsed = trimmed.startsWith('{')
        ? JSON.parse(trimmed)
        : JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
      initializeApp({ credential: cert(parsed) });
      firebaseAuth = getAuth();
      firebaseReady = true;
      console.log('[Auth] Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
      return true;
    }

    if (credPath && fs.existsSync(credPath)) {
      const parsed = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      initializeApp({ credential: cert(parsed) });
      firebaseAuth = getAuth();
      firebaseReady = true;
      console.log(`[Auth] Firebase Admin initialized from ${path.basename(credPath)}`);
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[Auth] Firebase Admin init skipped:', err.message);
    return false;
  }
}

initFirebaseAdmin();

function getPaystackSecretKey() {
  return (process.env.PAYSTACK_SECRET_KEY || '').trim();
}

function getPaystackPlans() {
  const currency = (process.env.PAYSTACK_CURRENCY || 'USD').trim().toUpperCase();
  return [
    {
      id: 'monthly',
      label: '1 Month',
      price: '$1.49',
      sublabel: '$1.49 / mo',
      badge: null,
      durationDays: 31,
      amountSubunits: parseInt(process.env.PAYSTACK_AMOUNT_MONTHLY || '149', 10),
      planCode: (process.env.PAYSTACK_PLAN_MONTHLY || '').trim(),
      currency
    },
    {
      id: '6months',
      label: '6 Months',
      price: '$6',
      sublabel: '$1.00 / mo · Save 33%',
      badge: 'Save 33%',
      durationDays: 183,
      amountSubunits: parseInt(process.env.PAYSTACK_AMOUNT_6MONTHS || '600', 10),
      planCode: (process.env.PAYSTACK_PLAN_6MONTHS || '').trim(),
      currency
    },
    {
      id: 'yearly',
      label: '1 Year',
      price: '$10',
      sublabel: '$0.83 / mo · Save 44%',
      badge: 'Best Value',
      durationDays: 366,
      amountSubunits: parseInt(process.env.PAYSTACK_AMOUNT_YEARLY || '1000', 10),
      planCode: (process.env.PAYSTACK_PLAN_YEARLY || '').trim(),
      currency
    }
  ];
}

function getPublicConfig() {
  const apiKey = process.env.FIREBASE_WEB_API_KEY || '';
  const authDomain = process.env.FIREBASE_WEB_AUTH_DOMAIN || '';
  const projectId = process.env.FIREBASE_WEB_PROJECT_ID || 'app-92db9b7e';
  const appId = process.env.FIREBASE_WEB_APP_ID || '';

  const plans = getPaystackPlans().map(({ id, label, price, sublabel, badge, currency }) => ({
    id,
    label,
    price,
    sublabel,
    badge,
    currency
  }));

  const firebaseConfig = apiKey ? { apiKey, authDomain, projectId } : null;
  if (firebaseConfig && appId) firebaseConfig.appId = appId;

  return {
    firebaseConfigured: Boolean(apiKey && authDomain && projectId),
    firebaseAdminConfigured: firebaseReady,
    paystackConfigured: Boolean(getPaystackSecretKey()),
    plans,
    firebase: firebaseConfig
  };
}

/**
 * Helper to call Paystack REST API (https://api.paystack.co)
 */
function paystackRequest(method, apiPath, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const secretKey = getPaystackSecretKey();
    if (!secretKey) {
      return reject(new Error('Paystack is not configured on the server yet (set PAYSTACK_SECRET_KEY).'));
    }

    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const headers = {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json'
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request({
      hostname: 'api.paystack.co',
      port: 443,
      path: apiPath,
      method,
      headers,
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.status !== false) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || `Paystack API error (${res.statusCode})`));
          }
        } catch (e) {
          reject(new Error(`Invalid response from Paystack (${res.statusCode})`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Paystack request timed out'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function isClaimsProActive(claims) {
  if (!claims || !claims.pro) return false;
  if (claims.proExpiresAt && Date.now() > Number(claims.proExpiresAt)) {
    return false;
  }
  return true;
}

/**
 * Middleware: verifies Firebase ID token if present, attaches req.user.
 */
async function optionalAuth(req, res, next) {
  req.user = null;
  if (!firebaseReady || !firebaseAuth) return next();

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return next();

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return next();

  try {
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const activePro = isClaimsProActive(decoded);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      picture: decoded.picture || null,
      isPro: activePro,
      plan: activePro ? (decoded.plan || 'pro') : 'free',
      proExpiresAt: decoded.proExpiresAt || null,
      paystackCustomerCode: decoded.paystackCustomerCode || null,
      paystackSubscriptionCode: decoded.paystackSubscriptionCode || null
    };
  } catch (err) {
    req.user = null;
  }
  next();
}

/**
 * Middleware: requires a valid signed-in Firebase user.
 */
function requireAuth(req, res, next) {
  if (!firebaseReady || !firebaseAuth) {
    return res.status(503).json({
      error: 'User accounts are not configured on the server yet (set FIREBASE_SERVICE_ACCOUNT_JSON).',
      code: 'AUTH_NOT_CONFIGURED'
    });
  }
  if (!req.user) {
    return res.status(401).json({
      error: 'Please sign in to continue.',
      code: 'AUTH_REQUIRED'
    });
  }
  next();
}

/**
 * Sets or revokes Pro custom claims on a Firebase Auth user.
 */
async function setUserProStatus(uid, {
  pro,
  plan = 'pro',
  durationDays = 31,
  paystackCustomerCode = null,
  paystackSubscriptionCode = null,
  paystackReference = null
}) {
  if (!firebaseReady || !firebaseAuth) {
    throw new Error('Firebase Admin is not configured');
  }

  const userRecord = await firebaseAuth.getUser(uid);
  const existingClaims = userRecord.customClaims || {};

  const nextClaims = {
    ...existingClaims,
    pro: Boolean(pro),
    plan: pro ? plan : 'free',
    proUpdatedAt: Date.now()
  };

  if (pro) {
    const now = Date.now();
    const baseTime = existingClaims.proExpiresAt && existingClaims.proExpiresAt > now
      ? existingClaims.proExpiresAt
      : now;
    nextClaims.proExpiresAt = baseTime + durationDays * 24 * 60 * 60 * 1000;
  } else {
    nextClaims.proExpiresAt = null;
  }

  if (paystackCustomerCode) nextClaims.paystackCustomerCode = String(paystackCustomerCode);
  if (paystackSubscriptionCode) nextClaims.paystackSubscriptionCode = String(paystackSubscriptionCode);
  if (paystackReference) nextClaims.paystackReference = String(paystackReference);

  await firebaseAuth.setCustomUserClaims(uid, nextClaims);
  return nextClaims;
}

function getAppOrigin(req) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto']?.split(',')[0].trim() || req.protocol || 'http';
  const host = req.headers['x-forwarded-host']?.split(',')[0].trim() || req.get('host');
  return `${proto}://${host}`;
}

/**
 * GET /api/auth/me - Returns fresh user profile & Pro status directly from Firebase Admin
 */
async function handleGetMe(req, res) {
  try {
    const userRecord = await firebaseAuth.getUser(req.user.uid);
    const claims = userRecord.customClaims || {};
    const activePro = isClaimsProActive(claims);
    res.json({
      uid: userRecord.uid,
      email: userRecord.email || null,
      displayName: userRecord.displayName || null,
      photoURL: userRecord.photoURL || null,
      isPro: activePro,
      plan: activePro ? (claims.plan || 'pro') : 'free',
      proExpiresAt: activePro ? (claims.proExpiresAt || null) : null,
      hasSubscriptionManage: Boolean(claims.paystackSubscriptionCode)
    });
  } catch (err) {
    console.error('[Auth] /api/auth/me error:', err.message);
    res.status(500).json({ error: 'Failed to load account status' });
  }
}

/**
 * POST /api/billing/paystack/initialize - Starts a Paystack hosted checkout / subscription
 */
async function handlePaystackInitialize(req, res) {
  try {
    if (!getPaystackSecretKey()) {
      return res.status(503).json({
        error: 'Paystack is not configured on the server yet (set PAYSTACK_SECRET_KEY in .env).'
      });
    }

    const planId = (req.body && req.body.planId) ? String(req.body.planId).trim() : 'yearly';
    const plan = getPaystackPlans().find(p => p.id === planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan selected.' });
    }

    const userRecord = await firebaseAuth.getUser(req.user.uid);
    const email = userRecord.email;
    if (!email) {
      return res.status(400).json({ error: 'Your account needs an email address to subscribe with Paystack.' });
    }

    const origin = getAppOrigin(req);
    const payload = {
      email,
      amount: plan.amountSubunits,
      callback_url: `${origin}/?pro=paystack`,
      metadata: {
        uid: req.user.uid,
        planId: plan.id,
        custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: `TwitSticker Pro (${plan.label})` }
        ]
      }
    };

    // If a Paystack Plan Code (PLN_...) is configured, attach it so Paystack uses the plan's exact currency & recurring amount
    if (plan.planCode) {
      payload.plan = plan.planCode;
    } else if (plan.currency) {
      payload.currency = plan.currency;
    }

    const result = await paystackRequest('POST', '/transaction/initialize', payload);
    res.json({
      authorization_url: result.data.authorization_url,
      access_code: result.data.access_code,
      reference: result.data.reference
    });
  } catch (err) {
    console.error('[Paystack] initialize error:', err.message);
    res.status(500).json({ error: err.message || 'Could not initialize Paystack checkout.' });
  }
}

/**
 * POST /api/billing/paystack/verify - Verifies transaction immediately after Paystack redirect
 */
async function handlePaystackVerify(req, res) {
  try {
    const reference = (req.body && req.body.reference) ? String(req.body.reference).trim() : '';
    if (!reference) {
      return res.status(400).json({ error: 'Missing Paystack transaction reference.' });
    }

    const result = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    const tx = result.data || {};

    if (tx.status !== 'success') {
      return res.status(400).json({ error: `Payment status is "${tx.status || 'incomplete'}".` });
    }

    const meta = tx.metadata || {};
    if (meta.uid && meta.uid !== req.user.uid) {
      return res.status(403).json({ error: 'This payment belongs to a different account.' });
    }

    const planId = meta.planId || 'monthly';
    const planObj = getPaystackPlans().find(p => p.id === planId) || getPaystackPlans()[0];

    // Prevent double-extending if user refreshes with the same reference
    const userRecord = await firebaseAuth.getUser(req.user.uid);
    const existingClaims = userRecord.customClaims || {};
    if (existingClaims.paystackReference === reference && isClaimsProActive(existingClaims)) {
      return res.json({
        success: true,
        isPro: true,
        plan: existingClaims.plan,
        proExpiresAt: existingClaims.proExpiresAt
      });
    }

    const claims = await setUserProStatus(req.user.uid, {
      pro: true,
      plan: `pro_${planObj.id}`,
      durationDays: planObj.durationDays,
      paystackCustomerCode: tx.customer?.customer_code || null,
      paystackReference: reference
    });

    console.log(`[Paystack] Verified ref ${reference} -> Pro (${planObj.id}) active for ${req.user.uid}`);
    res.json({
      success: true,
      isPro: true,
      plan: claims.plan,
      proExpiresAt: claims.proExpiresAt
    });
  } catch (err) {
    console.error('[Paystack] verify error:', err.message);
    res.status(500).json({ error: err.message || 'Could not verify Paystack payment.' });
  }
}

/**
 * POST /api/billing/paystack/manage-link - Generates Paystack hosted link to manage/cancel subscription
 */
async function handlePaystackManageLink(req, res) {
  try {
    const userRecord = await firebaseAuth.getUser(req.user.uid);
    const subCode = userRecord.customClaims && userRecord.customClaims.paystackSubscriptionCode;
    if (!subCode) {
      return res.status(400).json({
        error: 'No recurring Paystack subscription code found on your account (one-time pass expires automatically).'
      });
    }
    const result = await paystackRequest('GET', `/subscription/${encodeURIComponent(subCode)}/manage/link`);
    res.json({ url: result.data.link });
  } catch (err) {
    console.error('[Paystack] manage-link error:', err.message);
    res.status(500).json({ error: err.message || 'Could not generate subscription management link.' });
  }
}

async function resolveUidFromPaystackData(data) {
  const uid = data?.metadata?.uid;
  if (uid) return String(uid);
  const email = data?.customer?.email;
  if (email) {
    try {
      const u = await firebaseAuth.getUserByEmail(email);
      return u.uid;
    } catch (e) {}
  }
  return null;
}

/**
 * POST /api/billing/paystack/webhook - Verifies x-paystack-signature (HMAC-SHA512) & syncs Pro status
 */
async function handlePaystackWebhook(req, res) {
  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    return res.status(503).send('Paystack not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = req.headers['x-paystack-signature'];
  const expectedSig = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  if (!signature || signature !== expectedSig) {
    console.warn('[Paystack Webhook] Invalid x-paystack-signature');
    return res.status(401).send('Invalid signature');
  }

  if (!firebaseReady || !firebaseAuth) {
    return res.status(200).json({ received: true, skipped: 'firebase_unconfigured' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  try {
    const data = event.data || {};
    const uid = await resolveUidFromPaystackData(data);

    if (uid) {
      if (event.event === 'charge.success') {
        const planId = data?.metadata?.planId || 'monthly';
        const planObj = getPaystackPlans().find(p => p.id === planId) || getPaystackPlans()[0];
        await setUserProStatus(uid, {
          pro: true,
          plan: `pro_${planObj.id}`,
          durationDays: planObj.durationDays,
          paystackCustomerCode: data.customer?.customer_code || null,
          paystackReference: data.reference || null
        });
        console.log(`[Paystack Webhook] charge.success -> Pro granted to ${uid}`);
      } else if (event.event === 'subscription.create') {
        const subCode = data.subscription_code || null;
        await setUserProStatus(uid, {
          pro: true,
          plan: 'pro_subscription',
          durationDays: 31,
          paystackCustomerCode: data.customer?.customer_code || null,
          paystackSubscriptionCode: subCode
        });
        console.log(`[Paystack Webhook] subscription.create -> saved ${subCode} for ${uid}`);
      } else if (event.event === 'subscription.disable' || event.event === 'invoice.payment_failed') {
        await setUserProStatus(uid, { pro: false, plan: 'free' });
        console.log(`[Paystack Webhook] ${event.event} -> Pro revoked for ${uid}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Paystack Webhook] Error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

module.exports = {
  initFirebaseAdmin,
  getPublicConfig,
  optionalAuth,
  requireAuth,
  setUserProStatus,
  handleGetMe,
  handlePaystackInitialize,
  handlePaystackVerify,
  handlePaystackManageLink,
  handlePaystackWebhook
};
