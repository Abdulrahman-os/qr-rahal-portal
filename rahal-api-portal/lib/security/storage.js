/**
 * STORAGE ADAPTER — portal-local data only
 * ─────────────────────────────────────────────────────────────────────────
 * Staff accounts, passwords, and contact info all live in RAHAL's own
 * database (stafftravel.qatarairways.com.qa). The portal does NOT
 * maintain a shadow copy of any of that — credentials are validated live
 * against RAHAL on every login via lib/rahalAuthProxy.js.
 *
 * The only state this adapter manages is portal-specific:
 *
 *   refresh_tokens — opaque tokens issued by POST /api/auth/otp/verify.
 *     Short-lived access tokens are stateless JWTs (no storage needed).
 *     Refresh tokens are stored so they can be revoked on logout or
 *     password change.
 *
 * CURRENT IMPLEMENTATION: in-memory Map.
 *   Refresh tokens are lost on server restart (staff must log in again —
 *   acceptable for an initial production release since access tokens are
 *   15-minute JWTs and re-login takes < 60 seconds).
 *
 * TO ADD PERSISTENCE: replace the Map operations below with real DB
 *   queries (Postgres, Redis, DynamoDB — anything).  Keep the function
 *   signatures identical; every route continues to work unchanged.
 *
 *   Postgres example:
 *     CREATE TABLE refresh_tokens (
 *       token_hash   TEXT PRIMARY KEY,
 *       staff_number TEXT NOT NULL,
 *       expires_at   TIMESTAMPTZ NOT NULL,
 *       revoked_at   TIMESTAMPTZ,
 *       created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
 *     );
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const refreshTokens = new Map(); // tokenHash → { staffNumber, expiresAt, revokedAt }

module.exports = {

  // ── Refresh tokens ──────────────────────────────────────────────────────

  async saveRefreshToken(tokenHash, record) {
    refreshTokens.set(tokenHash, { ...record });
  },

  async getRefreshToken(tokenHash) {
    return refreshTokens.get(tokenHash) || null;
  },

  async revokeRefreshToken(tokenHash) {
    const rec = refreshTokens.get(tokenHash);
    if (rec) {
      rec.revokedAt = Date.now();
      refreshTokens.set(tokenHash, rec);
    }
  },

  async revokeAllRefreshTokensForStaff(staffNumber) {
    for (const [hash, rec] of refreshTokens.entries()) {
      if (rec.staffNumber === staffNumber && !rec.revokedAt) {
        rec.revokedAt = Date.now();
        refreshTokens.set(hash, rec);
      }
    }
  },

  // ── Diagnostics — dev only ──────────────────────────────────────────────

  _debugDump() {
    return {
      note: 'Staff accounts live in RAHAL — only portal refresh tokens are stored here.',
      refreshTokens: Array.from(refreshTokens.entries()),
    };
  },
};
