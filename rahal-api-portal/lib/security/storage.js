/**
 * STORAGE ADAPTER — portal-local session state only
 * ─────────────────────────────────────────────────────────────────────────
 * Staff account data lives in the RAHAL frontend at
 * https://stafftravel.qatarairways.com.qa. This adapter does NOT
 * maintain any shadow copy of accounts — all account reads/writes go
 * through rahalStaffClient (lib/rahalStaffClient.js).
 *
 * The only state managed here is portal-session-specific:
 *   refresh_tokens    — opaque tokens, short-lived, revocable
 *   activation_tokens — single-use, 72-hour TTL, portal-only lifecycle
 *
 * Both are intentionally in-memory: losing them on restart is acceptable
 * (staff re-login < 60 s; activation tokens are re-issuable by admin).
 * For persistence, replace Map ops with your DB queries — signatures stay
 * identical, all callers continue to work unchanged.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const activationTokens = new Map(); // tokenHash → { staffNumber, expiresAt, usedAt }
const refreshTokens    = new Map(); // tokenHash → { staffNumber, expiresAt, revokedAt }

module.exports = {

  // ── Activation tokens (portal-only, not persisted to RAHAL frontend) ───

  async saveActivationToken(tokenHash, record) {
    activationTokens.set(tokenHash, { ...record, usedAt: null });
  },

  async getActivationToken(tokenHash) {
    return activationTokens.get(tokenHash) || null;
  },

  async markActivationTokenUsed(tokenHash) {
    const rec = activationTokens.get(tokenHash);
    if (rec) activationTokens.set(tokenHash, { ...rec, usedAt: Date.now() });
  },

  async invalidateActivationTokensForStaff(staffNumber) {
    for (const [hash, rec] of activationTokens.entries()) {
      if (rec.staffNumber === staffNumber && !rec.usedAt) {
        activationTokens.set(hash, { ...rec, usedAt: Date.now() });
      }
    }
  },

  // ── Refresh tokens ──────────────────────────────────────────────────────

  async saveRefreshToken(tokenHash, record) {
    refreshTokens.set(tokenHash, { ...record });
  },

  async getRefreshToken(tokenHash) {
    return refreshTokens.get(tokenHash) || null;
  },

  async revokeRefreshToken(tokenHash) {
    const rec = refreshTokens.get(tokenHash);
    if (rec) refreshTokens.set(tokenHash, { ...rec, revokedAt: Date.now() });
  },

  async revokeAllRefreshTokensForStaff(staffNumber) {
    for (const [hash, rec] of refreshTokens.entries()) {
      if (rec.staffNumber === staffNumber && !rec.revokedAt) {
        refreshTokens.set(hash, { ...rec, revokedAt: Date.now() });
      }
    }
  },

  _debugDump() {
    return {
      note: 'Staff accounts live in RAHAL frontend — only portal session tokens stored here.',
      activationTokenCount: activationTokens.size,
      refreshTokenCount: refreshTokens.size,
    };
  },
};
