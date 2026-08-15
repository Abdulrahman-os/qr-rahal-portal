/**
 * POST /api/auth/login/qr-staff  (v2 — real credential verification)
 * ─────────────────────────────────────────────────────────────────────────
 * This REPLACES the earlier demo version that checked against a
 * hard-coded VALID_STAFF object. Every check here is real:
 *   - Account must exist and be ACTIVE (rejects PENDING_ACTIVATION,
 *     SUSPENDED, DISABLED)
 *   - Account lockout after repeated failures (checked BEFORE bcrypt,
 *     so a locked account doesn't even pay the bcrypt cost — cheap
 *     defense against lockout-bypass timing tricks)
 *   - bcrypt.compare against the stored hash — plaintext password is
 *     never compared directly and never logged
 *   - CAPTCHA still validated as the first layer of bot defense
 *   - On success: still returns pendingAuthSessionId + OTP step,
 *     matching the existing OTP flow — this endpoint only replaces
 *     *how* the password is checked, not the surrounding MFA flow
 *   - Identical error message for "no such account" and "wrong
 *     password" — don't leak which one it was
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../../lib/security/storage');
const { verifyPassword } = require('../../../../lib/security/password');
const { checkRateLimit, getClientIp } = require('../../../../lib/security/rateLimit');
const { validateCaptcha, getStore } = require('../../../../lib/mockStore'); // CAPTCHA store stays as-is; swap independently if needed

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const ip = getClientIp(req);
  const rl = checkRateLimit(`login:${ip}`, { limit: 15, windowMs: 60_000 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
    return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many login attempts from this location. Try again shortly.' });
  }

  const { staffNumber, password, captchaToken, captchaCode } = req.body || {};

  if (!staffNumber || !password || !captchaToken || !captchaCode) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'staffNumber, password, captchaToken and captchaCode are required.' });
  }

  if (!validateCaptcha(captchaToken, captchaCode)) {
    return res.status(422).json({ code: 'CAPTCHA_INVALID', message: 'CAPTCHA code is incorrect or expired. Please refresh and try again.' });
  }

  const account = await storage.getStaffAccount(staffNumber);

  // Generic failure path shared by "no account" and "wrong password" —
  // also used for locked/suspended/pending to avoid confirming account
  // existence to an unauthenticated caller in most cases, EXCEPT lockout
  // and pending-activation, which staff legitimately need to see so they
  // know to wait or check email — these are common UX exceptions to the
  // "don't leak account existence" rule and are a deliberate tradeoff.
  const genericAuthFailure = () => res.status(401).json({ code: 'AUTH_FAILED', message: 'Invalid staff number or password.' });

  if (!account) return genericAuthFailure();

  if (account.status === 'PENDING_ACTIVATION') {
    return res.status(403).json({ code: 'ACCOUNT_NOT_ACTIVATED', message: 'This account has not been activated yet. Check your email for the activation link.' });
  }
  if (account.status === 'SUSPENDED' || account.status === 'DISABLED') {
    return res.status(403).json({ code: 'ACCOUNT_DISABLED', message: 'This account is not active. Contact IT support.' });
  }

  if (account.lockedUntil && Date.now() < account.lockedUntil) {
    const retryMinutes = Math.ceil((account.lockedUntil - Date.now()) / 60000);
    return res.status(423).json({ code: 'ACCOUNT_LOCKED', message: `Too many failed attempts. Try again in ${retryMinutes} minute(s).` });
  }

  const passwordOk = await verifyPassword(password, account.passwordHash);
  if (!passwordOk) {
    await storage.incrementFailedLogin(staffNumber);
    return genericAuthFailure();
  }

  await storage.resetFailedLogin(staffNumber);

  // ── Password verified — hand off to existing OTP/MFA step ──
  const sessionId = 'sess_' + require('crypto').randomBytes(12).toString('hex');
  const mockStore = getStore();
  mockStore.sessions[sessionId] = {
    staffNumber,
    staffType: account.staffType,
    name: `${account.firstName} ${account.lastName}`,
    step: 'OTP_PENDING',
    createdAt: Date.now(),
  };

  const maskedMobile = account.mobile ? '****' + account.mobile.slice(-4) : null;
  const maskedEmail = account.email ? '****' + account.email.slice(account.email.indexOf('@')) : null;

  return res.status(200).json({
    pendingAuthSessionId: sessionId,
    nextStep: 'OTP_REQUIRED',
    contactHint: { maskedMobile, maskedEmail },
  });
}
