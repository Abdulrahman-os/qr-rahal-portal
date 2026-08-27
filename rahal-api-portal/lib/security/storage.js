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
 *   staff_accounts    — provisioned accounts (PENDING_ACTIVATION → ACTIVE)
 *   activation_tokens — single-use tokens issued at provisioning time
 *   refresh_tokens    — opaque tokens issued by POST /api/auth/otp/verify
 *
 * CURRENT IMPLEMENTATION: in-memory Maps.
 *   All state is lost on server restart. Acceptable for initial release —
 *   staff re-login takes < 60 seconds. For persistence, replace each
 *   Map operation with a real DB query (Postgres, Redis, DynamoDB).
 *   Function signatures are unchanged; every route continues to work.
 *
 * TO ADD PERSISTENCE (Postgres example):
 *   CREATE TABLE staff_accounts (
 *     staff_number     TEXT PRIMARY KEY,
 *     staff_type       TEXT NOT NULL,
 *     first_name       TEXT NOT NULL,
 *     last_name        TEXT NOT NULL,
 *     email            TEXT NOT NULL,
 *     mobile           TEXT,
 *     date_of_birth    TEXT NOT NULL,
 *     passport_number  TEXT NOT NULL,
 *     password_hash    TEXT,
 *     status           TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION',
 *     failed_login_count INT NOT NULL DEFAULT 0,
 *     locked_until     BIGINT,
 *     created_by       TEXT NOT NULL,
 *     created_at       BIGINT NOT NULL,
 *     activated_at     BIGINT
 *   );
 *   CREATE TABLE activation_tokens (
 *     token_hash   TEXT PRIMARY KEY,
 *     staff_number TEXT NOT NULL,
 *     expires_at   BIGINT NOT NULL,
 *     used_at      BIGINT
 *   );
 *   CREATE TABLE refresh_tokens (
 *     token_hash   TEXT PRIMARY KEY,
 *     staff_number TEXT NOT NULL,
 *     expires_at   BIGINT NOT NULL,
 *     revoked_at   BIGINT,
 *     created_at   BIGINT NOT NULL DEFAULT extract(epoch from now()) * 1000
 *   );
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const staffAccounts    = new Map(); // staffNumber → account record
const activationTokens = new Map(); // tokenHash → { staffNumber, expiresAt, usedAt }
const refreshTokens    = new Map(); // tokenHash → { staffNumber, expiresAt, revokedAt }

module.exports = {

  // ── Staff accounts ──────────────────────────────────────────────────────

  async createStaffAccount(record) {
    if (staffAccounts.has(record.staffNumber)) {
      const err = new Error(`Staff number ${record.staffNumber} already exists`);
      err.code = 'DUPLICATE_STAFF_NUMBER';
      throw err;
    }
    staffAccounts.set(record.staffNumber, { ...record });
  },

  async getStaffAccount(staffNumber) {
    return staffAccounts.get(staffNumber) || null;
  },

  async updateStaffAccount(staffNumber, updates) {
    const existing = staffAccounts.get(staffNumber);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    staffAccounts.set(staffNumber, updated);
    return updated;
  },

  // ── Activation tokens ───────────────────────────────────────────────────

  async saveActivationToken(tokenHash, record) {
    activationTokens.set(tokenHash, { ...record, usedAt: null });
  },

  async getActivationToken(tokenHash) {
    return activationTokens.get(tokenHash) || null;
  },

  async markActivationTokenUsed(tokenHash) {
    const rec = activationTokens.get(tokenHash);
    if (rec) {
      rec.usedAt = Date.now();
      activationTokens.set(tokenHash, rec);
    }
  },

  async invalidateActivationTokensForStaff(staffNumber) {
    for (const [hash, rec] of activationTokens.entries()) {
      if (rec.staffNumber === staffNumber && !rec.usedAt) {
        rec.usedAt = Date.now();
        activationTokens.set(hash, rec);
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
      note: 'Staff accounts live in RAHAL — only portal-local state is stored here.',
      staffAccounts: Array.from(staffAccounts.keys()),
      activationTokenCount: activationTokens.size,
      refreshTokenCount: refreshTokens.size,
    };
  },
};
