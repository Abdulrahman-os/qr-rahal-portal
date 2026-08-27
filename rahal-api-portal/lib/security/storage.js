/**
 * STORAGE ADAPTER — portal-local data only
 * ─────────────────────────────────────────────────────────────────────────
 * RAHAL (stafftravel.qatarairways.com.qa) is currently UI-only with no
 * REST API. This adapter keeps a portal-local record of:
 *
 *   staff_accounts   — lightweight index of provisioned staff (staffNumber,
 *                      status, passwordHash for login, failedLoginCount …).
 *                      Not a shadow copy of RAHAL — only what the portal
 *                      needs to drive login, activation, and lockout.
 *
 *   activation_tokens — single-use 72-hour tokens issued at provisioning.
 *
 *   refresh_tokens   — portal JWT refresh tokens (revocable on logout).
 *
 * CURRENT IMPLEMENTATION: in-memory Maps.
 *   Data is lost on server restart — staff must be re-provisioned or the
 *   token re-issued. Acceptable for initial release; swap the Map bodies
 *   below for real DB queries when persistence is needed.
 *
 * UPGRADE PATH (when RAHAL gains an API):
 *   Replace createStaffAccount / getStaffAccount / updateStaffAccount with
 *   rahalStaffClient calls. Keep activation_tokens and refresh_tokens here
 *   (they are portal-specific and don't belong in RAHAL).
 * ─────────────────────────────────────────────────────────────────────────
 */
'use strict';

const staffAccounts    = new Map();
const activationTokens = new Map();
const refreshTokens    = new Map();

module.exports = {

  // ── Staff accounts ──────────────────────────────────────────────────────

  async createStaffAccount(record) {
    if (staffAccounts.has(record.staffNumber)) {
      throw Object.assign(new Error('DUPLICATE_STAFF_NUMBER'), { code: 'DUPLICATE_STAFF_NUMBER' });
    }
    staffAccounts.set(record.staffNumber, { ...record });
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
      acc.lockedUntil = Date.now() + 15 * 60 * 1000;
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

  // ── Activation tokens ───────────────────────────────────────────────────

  async saveActivationToken(tokenHash, record) {
    activationTokens.set(tokenHash, { ...record });
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

  // ── Refresh tokens ──────────────────────────────────────────────────────

  async saveRefreshToken(tokenHash, record) {
    refreshTokens.set(tokenHash, { ...record });
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

  // ── Diagnostics — dev only ──────────────────────────────────────────────

  _debugDump() {
    return {
      staffAccounts:    Array.from(staffAccounts.entries()),
      activationTokens: Array.from(activationTokens.entries()),
      refreshTokens:    Array.from(refreshTokens.entries()),
    };
  },
};
