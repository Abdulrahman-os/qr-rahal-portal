/**
 * POST /api/auth/login/qr-staff
 * ─────────────────────────────────────────────────────────────────────────
 * Authenticates Former Staff and QAA/QEEL by proxying credentials to the
 * live RAHAL system (stafftravel.qatarairways.com.qa).
 *
 * Why proxy? RAHAL currently has no REST API — it is UI-only. This endpoint
 * acts as a server-side browser: it submits the staff's credentials to
 * RAHAL's own login form and inspects the response to determine validity.
 * Staff accounts, passwords, and contact info (masked mobile/email) all
 * live in RAHAL's own database — this portal holds nothing.
 *
 * When IT delivers a formal RAHAL REST API, only lib/rahalAuthProxy.js
 * needs updating. This route stays unchanged.
 *
 * FLOW
 * ─────────────────────────────────────────────────────────────────────────
 *   1. Rate-limit by IP
 *   2. Validate CAPTCHA (our own, stops bots before touching RAHAL)
 *   3. Forward staffNumber + password to RAHAL via rahalAuthProxy
 *   4. On RAHAL success: create a short-lived portal session and return
 *      pendingAuthSessionId so the caller can proceed to OTP
 *   5. On RAHAL failure: mirror RAHAL's error code back to the caller
 * ─────────────────────────────────────────────────────────────────────────
 */

const { authenticate } = require('../../../../lib/rahalAuthProxy');
const { checkRateLimit, getClientIp } = require('../../../../lib/security/rateLimit');
const { validateCaptcha, getStore } = require('../../../../lib/mockStore');

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  }

  // ── 1. Rate limit ─────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rl = checkRateLimit(`login:${ip}`, { limit: 15, windowMs: 60_000 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
    return res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many login attempts from this location. Try again shortly.',
    });
  }

  const { staffNumber, password, staffType, captchaToken, captchaCode } = req.body || {};

  if (!staffNumber || !password || !captchaToken || !captchaCode) {
    return res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: 'staffNumber, password, captchaToken and captchaCode are required.',
    });
  }

  // ── 2. CAPTCHA (our own guard — stops bots before hitting RAHAL) ──────────
  if (!validateCaptcha(captchaToken, captchaCode)) {
    return res.status(422).json({
      code: 'CAPTCHA_INVALID',
      message: 'CAPTCHA code is incorrect or expired. Please refresh and try again.',
    });
  }

  // ── 3. Proxy credentials to RAHAL ─────────────────────────────────────────
  let rahalResult;
  try {
    rahalResult = await authenticate(staffNumber, password, staffType || 'FORMER_STAFF');
  } catch (err) {
    console.error('[login/qr-staff] Unexpected error from rahalAuthProxy:', err.message);
    return res.status(502).json({
      code: 'RAHAL_PROXY_ERROR',
      message: 'Could not reach the RAHAL authentication service. Please try again shortly.',
    });
  }

  // ── 4a. RAHAL returned a specific status we should surface ────────────────
  if (!rahalResult.success) {
    const code = rahalResult.rahalErrorCode || 'AUTH_FAILED';

    if (code === 'RAHAL_UNREACHABLE') {
      return res.status(502).json({
        code: 'RAHAL_UNREACHABLE',
        message: 'RAHAL is temporarily unreachable. Please try again in a moment.',
      });
    }
    if (code === 'ACCOUNT_LOCKED') {
      return res.status(423).json({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Your account has been locked by RAHAL — try again later or contact IT support.',
      });
    }
    if (code === 'ACCOUNT_NOT_ACTIVATED') {
      return res.status(403).json({
        code: 'ACCOUNT_NOT_ACTIVATED',
        message: 'This account has not been activated yet. Check your email for the activation link.',
      });
    }
    if (code === 'ACCOUNT_DISABLED') {
      return res.status(403).json({
        code: 'ACCOUNT_DISABLED',
        message: 'This account is not active. Contact IT support.',
      });
    }

    // Generic — don't reveal whether staff number or password was wrong
    return res.status(401).json({
      code: 'AUTH_FAILED',
      message: 'Invalid staff number or password.',
    });
  }

  // ── 4b. RAHAL confirmed credentials — create portal session ──────────────
  const sessionId = 'sess_' + require('crypto').randomBytes(12).toString('hex');
  const store = getStore();

  store.sessions[sessionId] = {
    staffNumber,
    staffType:      rahalResult.staffType || staffType || 'FORMER_STAFF',
    name:           rahalResult.name || staffNumber,   // fallback until profile fetch
    step:           'OTP_PENDING',
    createdAt:      Date.now(),
    // Preserve the RAHAL session so OTP send can call RAHAL if needed
    rahalSession:   rahalResult.rahalSession || null,
    sessionCookie:  rahalResult.sessionCookie || null,
    // Real contact hints from RAHAL
    maskedMobile:   rahalResult.maskedMobile || null,
    maskedEmail:    rahalResult.maskedEmail  || null,
  };

  return res.status(200).json({
    pendingAuthSessionId: sessionId,
    nextStep: 'OTP_REQUIRED',
    contactHint: {
      maskedMobile: rahalResult.maskedMobile || null,
      maskedEmail:  rahalResult.maskedEmail  || null,
    },
  });
}
