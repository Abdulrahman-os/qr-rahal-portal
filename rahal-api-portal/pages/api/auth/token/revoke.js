/**
 * POST /api/auth/token/revoke  (production logout)
 * ─────────────────────────────────────────────────────────────────────────
 * The access token (JWT) itself can't be "deleted" — it's stateless and
 * self-verifying, so it remains technically valid until it expires
 * (15 min). What CAN be revoked is the refresh token, which prevents
 * getting a new access token once this one expires. This is the
 * standard, accepted tradeoff of short-lived-access + revocable-refresh
 * token design: a stolen access token is dangerous for at most 15
 * minutes, not indefinitely.
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../../lib/security/storage');
const { sha256 } = require('../../../../lib/security/tokens');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'refreshToken is required.' });

  await storage.revokeRefreshToken(sha256(refreshToken));
  return res.status(200).json({ message: 'Logged out. Refresh token revoked.' });
}
