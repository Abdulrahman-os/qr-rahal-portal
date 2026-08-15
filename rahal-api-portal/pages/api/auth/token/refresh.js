/**
 * POST /api/auth/token/refresh
 * ─────────────────────────────────────────────────────────────────────────
 * Exchanges a valid, unrevoked refresh token for a new short-lived
 * access token, without requiring the user to log in (password + OTP)
 * again every 15 minutes.
 *
 * Rotation: each use of a refresh token issues a NEW refresh token and
 * revokes the old one (rotation). This means a stolen refresh token
 * that gets used by an attacker AND later by the legitimate user will
 * be detected — the second user to present the now-revoked token gets
 * rejected, which is a signal worth alerting on in production (possible
 * token theft).
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../../lib/security/storage');
const { sha256, generateOpaqueToken } = require('../../../../lib/security/tokens');
const { signAccessToken, REFRESH_TOKEN_TTL_SECONDS } = require('../../../../lib/security/jwt');
const crypto = require('crypto');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'refreshToken is required.' });

  const hash = sha256(refreshToken);
  const record = await storage.getRefreshToken(hash);

  const invalid = () => res.status(401).json({ code: 'REFRESH_TOKEN_INVALID', message: 'Refresh token is invalid, expired, or has been revoked. Please log in again.' });

  if (!record) return invalid();
  if (record.revokedAt) return invalid();       // possible reuse of a rotated-out token — see note above
  if (Date.now() > record.expiresAt) return invalid();

  const account = await storage.getStaffAccount(record.staffNumber);
  if (!account || account.status !== 'ACTIVE') return invalid();

  // ── Rotate: revoke old, issue new ──
  await storage.revokeRefreshToken(hash);
  const { raw: newRaw, hash: newHash } = generateOpaqueToken(32);
  await storage.saveRefreshToken(newHash, {
    staffNumber: record.staffNumber,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    revokedAt: null,
  });

  const accessToken = signAccessToken({
    sub: account.staffNumber,
    staffType: account.staffType,
    name: `${account.firstName} ${account.lastName}`,
    jti: crypto.randomUUID(),
  });

  return res.status(200).json({
    accessToken,
    refreshToken: newRaw,
    tokenType: 'Bearer',
    expiresInSeconds: 900,
  });
}
