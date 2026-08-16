/**
 * ROLES & SCOPES
 * ─────────────────────────────────────────────────────────────────────────
 * Scopes are fine-grained permissions (what an action can DO).
 * Roles are named bundles of scopes (who someone IS), assigned at
 * token-issuance time based on staffType/account status.
 *
 * This is the single source of truth for the mapping — signing code
 * (otp/verify-v2.js, token/refresh.js) reads SCOPES_BY_ROLE to decide
 * what to bake into a token; enforcement code (requireAuth.js) reads
 * a token's own `scopes` claim, not this file, at request time — so a
 * change here only affects NEWLY issued tokens, never retroactively
 * changes what an already-issued token can do. That's intentional:
 * revoking a capability requires revoking/reissuing tokens (see
 * lib/security/storage.js revokeAllRefreshTokensForStaff), not just
 * editing this file.
 * ─────────────────────────────────────────────────────────────────────────
 */

const SCOPES = {
  PROFILE_READ: 'profile:read',
  PROFILE_WRITE: 'profile:write',
  ENTITLEMENTS_READ: 'entitlements:read',
  FLIGHTS_SEARCH: 'flights:search',
  BOOKINGS_READ: 'bookings:read',
  BOOKINGS_WRITE: 'bookings:write',       // create/change a booking — real money movement
  LISTINGS_WRITE: 'listings:write',
  REFUND_READ: 'refund:read',
  REFUND_WRITE: 'refund:write',           // issues a real refund — highest-sensitivity scope
  ADMIN_PROVISION: 'admin:provision',     // create staff accounts — separate trust boundary, see adminAuth.js
};

const ROLES = {
  STAFF: 'STAFF',   // Former Staff / QAA-QEEL — full self-service scope set
  OAL: 'OAL',        // Other Airlines Staff — deliberately narrow, ticket-scoped
  ADMIN: 'ADMIN',    // reserved for future use — see note below
};

const SCOPES_BY_ROLE = {
  [ROLES.STAFF]: [
    SCOPES.PROFILE_READ, SCOPES.PROFILE_WRITE,
    SCOPES.ENTITLEMENTS_READ,
    SCOPES.FLIGHTS_SEARCH,
    SCOPES.BOOKINGS_READ, SCOPES.BOOKINGS_WRITE,
    SCOPES.LISTINGS_WRITE,
    SCOPES.REFUND_READ, SCOPES.REFUND_WRITE,
  ],
  [ROLES.OAL]: [
    // Deliberately narrow: OAL staff authenticate with a ticket number,
    // not a staff account, and should only ever touch the booking tied
    // to that ticket — never issue new bookings, never refund, never
    // see other staff's data. No BOOKINGS_WRITE, no REFUND_WRITE here
    // on purpose.
    SCOPES.BOOKINGS_READ,
    SCOPES.FLIGHTS_SEARCH,
  ],
  [ROLES.ADMIN]: [
    // Not currently issued to anyone — the real provisioning endpoint
    // uses a completely separate trust boundary (static internal API
    // key, see lib/security/adminAuth.js), not a staff JWT with this
    // role. This exists as a defined placeholder for a possible future
    // "QR IT support staff" JWT-based admin console, kept explicit
    // rather than implicit so it's a deliberate decision if it's ever
    // wired up, not an accident.
    SCOPES.ADMIN_PROVISION,
    ...Object.values(SCOPES).filter(s => s !== SCOPES.ADMIN_PROVISION),
  ],
};

function scopesForRole(role) {
  return SCOPES_BY_ROLE[role] || [];
}

module.exports = { SCOPES, ROLES, SCOPES_BY_ROLE, scopesForRole };
