/**
 * GET /api/health  (also reachable at /health via next.config.js rewrite)
 *
 * Basic liveness/readiness check. Deliberately returns NO sensitive
 * info (no env var values, no key material, no internal error
 * details) — just enough to confirm the service is up and which
 * major subsystems initialized without throwing.
 */
const { getJwk } = require('../../lib/security/jwt');

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use GET' });

  const checks = {};

  // Confirms the JWT signing key loaded/generated without error —
  // does NOT reveal whether it's the real configured key or the
  // ephemeral dev fallback (see lib/security/jwt.js) since that
  // distinction isn't safe to expose on a public endpoint.
  try {
    getJwk();
    checks.jwtSigning = 'ok';
  } catch {
    checks.jwtSigning = 'error';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');

  res.setHeader('Cache-Control', 'no-store');
  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
}
