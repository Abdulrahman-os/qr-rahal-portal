/**
 * GET /api/jwks  (also reachable at /.well-known/jwks.json via the
 * rewrite in next.config.js — that's the conventional path per
 * RFC 7517 / OpenID Connect Discovery, hence the rewrite rather than
 * putting the file there directly, since Next.js's Pages Router
 * treats bare files under pages/ as page components, not API routes,
 * unless they're under pages/api/).
 *
 * Publishes the public key that verifies Bearer JWTs issued by this
 * service (see lib/security/jwt.js signAccessToken/verifyAccessToken)
 * — NOT the CLIENT_SIGNING_PUBLIC_KEY used by
 * /api/security/public-keys, which is a separate key for a separate
 * purpose (payload signing for a real backend counterparty, still
 * inactive). This endpoint is about THIS service's own issued tokens.
 *
 * Standard JWKS shape: { keys: [ { kty, n, e, kid, use, alg }, ... ] }
 * — an array because real deployments rotate keys and briefly publish
 * both old and new during the rotation window. This service currently
 * has exactly one active key, so the array has one entry.
 */
const { getJwk } = require('../../lib/security/jwt');

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use GET' });

  let jwk;
  try {
    jwk = getJwk();
  } catch (err) {
    return res.status(500).json({ code: 'JWKS_GENERATION_FAILED', message: err.message });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // same rotation-friendly caching as /api/security/public-keys
  return res.status(200).json({ keys: [jwk] });
}
