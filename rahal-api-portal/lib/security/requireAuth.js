/**
 * requireAuth(req) — use in any protected route instead of the old
 * mockStore.validateToken. Verifies a real RS256-signed JWT rather than
 * checking an in-memory token map.
 *
 * Usage in a route handler:
 *   const { requireAuth } = require('../../../lib/security/requireAuth');
 *   export default async function handler(req, res) {
 *     const user = requireAuth(req);
 *     if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
 *     // user.sub is the staffNumber, user.staffType, user.name available
 *     ...
 *   }
 */
const { verifyAccessToken } = require('./jwt');

function requireAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) return null;
  return payload; // { sub, staffType, name, jti, iat, exp, iss, aud }
}

module.exports = { requireAuth };
