/**
 * POST /api/auth/otp/verify  (v2 — real JWT issuance)
 * ─────────────────────────────────────────────────────────────────────────
 * Same OTP-checking logic as before, but on success this now issues:
 *   - accessToken: a real RS256-signed JWT (15 min TTL) — see lib/security/jwt.js
 *   - refreshToken: an opaque random token (7 day TTL), stored server-side
 *     as a SHA-256 hash so it can be revoked (logout, password change,
 *     suspected compromise) without needing JWT blocklisting
 *
 * Access tokens are stateless and self-verifying (any service with the
 * public key can check them without calling back to this service).
 * Refresh tokens are stateful and revocable — that's the whole reason
 * both exist: short-lived stateless tokens for normal API calls, a
 * longer-lived stateful token only used to mint new access tokens.
 * ─────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const storage = require('../../../../lib/security/storage');
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
  if (!session) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Session not found or expired.' });
  if (!session.otp) return res.status(400).json({ code: 'OTP_NOT_SENT', message: 'No OTP sent for this session.' });
  if (Date.now() > session.otpExpires) return res.status(401).json({ code: 'OTP_EXPIRED', message: 'OTP has expired. Please request a new one.' });
  if (session.otp !== otpCode) return res.status(401).json({ code: 'OTP_INVALID', message: 'Incorrect OTP code.' });

  // ── Issue real tokens ──
  const account = await storage.getStaffAccount(session.staffNumber);
  const jti = crypto.randomUUID(); // unique token ID — useful for future per-token revocation/audit

  // All QR Staff (Former Staff / QAA-QEEL) get the STAFF role — OAL
  // gets a narrower role via a separate login route (login/oal.js),
  // not this one, since OAL never goes through OTP.
  const role = ROLES.STAFF;
  const scopes = scopesForRole(role);

  const accessToken = signAccessToken({
    sub: session.staffNumber,
    staffType: session.staffType,
    name: session.name,
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
    expiresInSeconds: 900, // matches ACCESS_TOKEN_TTL_SECONDS in lib/security/jwt.js
    staffNumber: session.staffNumber,
    staffType: session.staffType,
    displayName: session.name,
    role,
    scopes,
  });
}
