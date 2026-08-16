/**
 * requireAuth(req) — use in any protected route instead of the old
 * mockStore.validateToken. Verifies a real RS256-signed JWT rather than
 * checking an in-memory token map.
 *
 * Usage in a route handler:
 *   const { requireAuth, hasScope } = require('../../../lib/security/requireAuth');
 *   const { SCOPES } = require('../../../lib/security/roles');
 *   export default async function handler(req, res) {
 *     const user = requireAuth(req);
 *     if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
 *     if (!hasScope(user, SCOPES.BOOKINGS_WRITE)) {
 *       return res.status(403).json({ code:'FORBIDDEN', message:'Missing required scope: bookings:write' });
 *     }
 *     // user.sub is the staffNumber (or ticketNumber for OAL), user.role, user.scopes available
 *     ...
 *   }
 *
 * For OAL sessions specifically, scope alone isn't enough — a route
 * handling a specific PNR/ticket should ALSO check
 * matchesTicketScope(user, ticketNumberBeingAccessed) so an OAL token
 * can't read a booking other than the one it authenticated with, even
 * though its scopes technically include bookings:read.
 */
const { verifyAccessToken } = require('./jwt');

function requireAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) return null;
  return payload; // { sub, staffType, name, role, scopes, jti, iat, exp, iss, aud, scopedToTicket? }
}

/**
 * Checks whether a verified token payload carries a given scope.
 * Returns false (not throws) on a malformed/scope-less payload, so
 * callers can use it directly in an `if` without extra null-checking.
 */
function hasScope(payload, scope) {
  if (!payload || !Array.isArray(payload.scopes)) return false;
  return payload.scopes.includes(scope);
}

/**
 * For OAL tokens only: confirms the token's scopedToTicket claim
 * matches the specific ticket/PNR a route is about to act on. Staff
 * tokens (no scopedToTicket claim) always pass this check — the
 * restriction is specific to the OAL trust boundary, not staff.
 */
function matchesTicketScope(payload, ticketOrPnr) {
  if (!payload) return false;
  if (!payload.scopedToTicket) return true; // not an OAL token — no restriction applies
  return payload.scopedToTicket === ticketOrPnr;
}

module.exports = { requireAuth, hasScope, matchesTicketScope };
