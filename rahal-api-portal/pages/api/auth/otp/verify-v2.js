/**
 * POST /api/auth/otp/verify  (v2 — real JWT issuance)
 * ─────────────────────────────────────────────────────────────────────────
 * Verifies OTP + CAPTCHA, then issues access + refresh tokens.
 * Staff account lookup goes through RAHAL frontend (not local storage).
 * ─────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const storage = require('../../../../lib/security/storage');
const rahalStaff = require('../../../../lib/rahalStaffClient');
const { validateCaptcha, getStore } = require('../../../../lib/mockStore');
const { signAccessToken, REFRESH_TOKEN_TTL_SECONDS } = require('../../../../lib/security/jwt');
const { generateOpaqueToken } = require('../../../../lib/security/tokens');
const { ROLES, scopesForRole } = require('../../../../lib/security/roles');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { pendingAuthSessionId, otpCode, captchaToken, captchaCode } = req.body || {};
  if (!pendingAuthSessionId || !otpCode || !captchaToken || !captchaCode) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'pendingAuthSessionId, otpCode, captchaToken and captchaCode are required.' });
  }
  if (!validateCaptcha(captchaToken, captchaCode)) {
    return res.status(422).json({ code: 'CAPTCHA_INVALID', message: 'CAPTCHA code incorrect or expired.' });
  }

  const mockStore = getStore();
  const session = mockStore.sessions[pendingAuthSessionId];
  if (!session)                      return res.status(401).json({ code: 'SESSION_INVALID',  message: 'Session not found or expired.' });
  if (!session.otp)                  return res.status(400).json({ code: 'OTP_NOT_SENT',     message: 'No OTP sent for this session.' });
  if (Date.now() > session.otpExpires) return res.status(401).json({ code: 'OTP_EXPIRED',    message: 'OTP has expired. Please request a new one.' });
  if (session.otp !== otpCode)       return res.status(401).json({ code: 'OTP_INVALID',      message: 'Incorrect OTP code.' });

  // ── Fetch account from RAHAL frontend to confirm it's still ACTIVE ──
  let account = null;
  try {
    account = await rahalStaff.getStaffAccount(session.staffNumber);
  } catch (_) {
    // Non-fatal — token can still be issued from session data if frontend
    // is temporarily unreachable; account status will be re-checked on refresh.
  }
  if (account && account.status !== 'ACTIVE') {
    return res.status(403).json({ code: 'ACCOUNT_NOT_ACTIVE', message: 'Account is not active. Contact HR/IT.' });
  }

  // ── Issue tokens ──
  const role   = ROLES.STAFF;
  const scopes = scopesForRole(role);
  const jti    = crypto.randomUUID();

  const accessToken = signAccessToken({
    sub:       session.staffNumber,
    staffType: session.staffType,
    name:      session.name,
    role,
    scopes,
    jti,
  });

  const { raw: refreshTokenRaw, hash: refreshTokenHash } = generateOpaqueToken(32);
  await storage.saveRefreshToken(refreshTokenHash, {
    staffNumber: session.staffNumber,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    revokedAt: null,
  });

  delete mockStore.sessions[pendingAuthSessionId];

  return res.status(200).json({
    accessToken,
    refreshToken: refreshTokenRaw,
    tokenType: 'Bearer',
    expiresInSeconds: 900,
    staffNumber: session.staffNumber,
    staffType:   session.staffType,
    displayName: session.name,
    role,
    scopes,
  });
}
