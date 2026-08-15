/**
 * STORAGE ADAPTER — SWAP POINT FOR PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────
 * Everything in this file is an in-memory Map. That means all staff
 * accounts, activation tokens, and refresh tokens are LOST on every
 * server restart / redeploy / cold start.
 *
 * This is the ONLY file that should need to change to go live:
 * replace each method's body with real queries against Postgres /
 * MySQL / DynamoDB / etc. Keep the function signatures identical and
 * every route in pages/api/** continues to work unmodified.
 *
 * Suggested real schema (Postgres):
 *
 *   CREATE TABLE staff_accounts (
 *     staff_number      TEXT PRIMARY KEY,
 *     staff_type        TEXT NOT NULL,           -- FORMER_STAFF | QAA_QEEL
 *     first_name        TEXT NOT NULL,
 *     last_name         TEXT NOT NULL,
 *     email             TEXT NOT NULL,
 *     mobile            TEXT,
 *     date_of_birth     DATE NOT NULL,
 *     passport_number   TEXT NOT NULL,
 *     password_hash     TEXT,                    -- NULL until activated
 *     status            TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION',
 *                        -- PENDING_ACTIVATION | ACTIVE | SUSPENDED | DISABLED
 *     failed_login_count INT NOT NULL DEFAULT 0,
 *     locked_until      TIMESTAMPTZ,
 *     created_by        TEXT NOT NULL,            -- admin/HR system identity
 *     created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     activated_at      TIMESTAMPTZ
 *   );
 *
 *   CREATE TABLE activation_tokens (
 *     token_hash    TEXT PRIMARY KEY,             -- sha256 of the raw token
 *     staff_number  TEXT NOT NULL REFERENCES staff_accounts(staff_number),
 *     expires_at    TIMESTAMPTZ NOT NULL,
 *     used_at       TIMESTAMPTZ,
 *     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 *
 *   CREATE TABLE refresh_tokens (
 *     token_hash    TEXT PRIMARY KEY,
 *     staff_number  TEXT NOT NULL REFERENCES staff_accounts(staff_number),
 *     expires_at    TIMESTAMPTZ NOT NULL,
 *     revoked_at    TIMESTAMPTZ,
 *     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 *
 * Never store raw activation/refresh tokens — only their SHA-256 hash
 * (see lib/security/tokens.js). A DB leak then reveals nothing usable.
 * ─────────────────────────────────────────────────────────────────────────
 */

const staffAccounts    = new Map(); // staffNumber -> account record
const activationTokens = new Map(); // tokenHash    -> { staffNumber, expiresAt, usedAt }
const refreshTokens    = new Map(); // tokenHash    -> { staffNumber, expiresAt, revokedAt }

module.exports = {
  // ── Staff accounts ──────────────────────────────────────────────
  async createStaffAccount(record) {
    if (staffAccounts.has(record.staffNumber)) {
      throw Object.assign(new Error('DUPLICATE_STAFF_NUMBER'), { code: 'DUPLICATE_STAFF_NUMBER' });
    }
    staffAccounts.set(record.staffNumber, record);
    return record;
  },

  async getStaffAccount(staffNumber) {
    return staffAccounts.get(staffNumber) || null;
  },

  async updateStaffAccount(staffNumber, patch) {
    const existing = staffAccounts.get(staffNumber);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    staffAccounts.set(staffNumber, updated);
    return updated;
  },

  async incrementFailedLogin(staffNumber) {
    const acc = staffAccounts.get(staffNumber);
    if (!acc) return null;
    acc.failedLoginCount = (acc.failedLoginCount || 0) + 1;
    if (acc.failedLoginCount >= 5) {
      acc.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lockout
    }
    staffAccounts.set(staffNumber, acc);
    return acc;
  },

  async resetFailedLogin(staffNumber) {
    const acc = staffAccounts.get(staffNumber);
    if (!acc) return null;
    acc.failedLoginCount = 0;
    acc.lockedUntil = null;
    staffAccounts.set(staffNumber, acc);
    return acc;
  },

  // ── Activation tokens ───────────────────────────────────────────
  async saveActivationToken(tokenHash, record) {
    activationTokens.set(tokenHash, record);
  },

  async getActivationToken(tokenHash) {
    return activationTokens.get(tokenHash) || null;
  },

  async markActivationTokenUsed(tokenHash) {
    const rec = activationTokens.get(tokenHash);
    if (rec) { rec.usedAt = Date.now(); activationTokens.set(tokenHash, rec); }
  },

  async invalidateActivationTokensForStaff(staffNumber) {
    for (const [hash, rec] of activationTokens.entries()) {
      if (rec.staffNumber === staffNumber && !rec.usedAt) {
        rec.usedAt = Date.now();
        activationTokens.set(hash, rec);
      }
    }
  },

  // ── Refresh tokens ──────────────────────────────────────────────
  async saveRefreshToken(tokenHash, record) {
    refreshTokens.set(tokenHash, record);
  },

  async getRefreshToken(tokenHash) {
    return refreshTokens.get(tokenHash) || null;
  },

  async revokeRefreshToken(tokenHash) {
    const rec = refreshTokens.get(tokenHash);
    if (rec) { rec.revokedAt = Date.now(); refreshTokens.set(tokenHash, rec); }
  },

  async revokeAllRefreshTokensForStaff(staffNumber) {
    for (const [hash, rec] of refreshTokens.entries()) {
      if (rec.staffNumber === staffNumber && !rec.revokedAt) {
        rec.revokedAt = Date.now();
        refreshTokens.set(hash, rec);
      }
    }
  },

  // Diagnostics only — not for production use
  _debugDump() {
    return {
      staffAccounts: Array.from(staffAccounts.entries()),
      activationTokens: Array.from(activationTokens.entries()),
      refreshTokens: Array.from(refreshTokens.entries()),
    };
  }
};
