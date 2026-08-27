/**
 * POST /api/auth/token/refresh
 * ─────────────────────────────────────────────────────────────────────────
 * Exchanges a valid, unrevoked refresh token for a new access token.
 * Refresh tokens rotate on every use. Staff account status is re-checked
 * on each refresh against the RAHAL frontend so suspensions take effect
 * within one token TTL (15 min) without requiring a full re-login.
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../../lib/security/storage');
const rahalStaff = require('../../../../lib/rahalStaffClient');
const { sha256, generateOpaqueToken } = require('../../../../lib/security/tokens');
const { signAccessToken, REFRESH_TOKEN_TTL_SECONDS } = require('../../../../lib/security/jwt');
const { ROLES, scopesForRole } = require('../../../../lib/security/roles');
const crypto = require('crypto');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'refreshToken is required.' });

  const hash   = sha256(refreshToken);
  const record = await storage.getRefreshToken(hash);
  const invalid = () => res.status(401).json({ code: 'REFRESH_TOKEN_INVALID', message: 'Refresh token is invalid, expired, or has been revoked. Please log in again.' });

  if (!record)           return invalid();
  if (record.revokedAt)  return invalid();
  if (Date.now() > record.expiresAt) return invalid();

  // ── Re-check account status on RAHAL frontend ──
  let account;
  try {
    account = await rahalStaff.getStaffAccount(record.staffNumber);
  } catch (err) {
    return res.status(502).json({ code: 'RAHAL_FRONTEND_ERROR', message: `Could not verify account: ${err.message}` });
  }
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
    sub:       account.staffNumber,
    staffType: account.staffType,
    name:      `${account.firstName} ${account.lastName}`,
    role:      ROLES.STAFF,
    scopes:    scopesForRole(ROLES.STAFF),
    jti:       crypto.randomUUID(),
  });

  return res.status(200).json({
    accessToken,
    refreshToken: newRaw,
    tokenType: 'Bearer',
    expiresInSeconds: 900,
  });
}
