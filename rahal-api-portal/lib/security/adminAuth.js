/**
 * ADMIN / SYSTEM AUTHENTICATION FOR PROVISIONING
 * ─────────────────────────────────────────────────────────────────────────
 * The provisioning endpoint (POST /api/admin/staff/provision) is the most
 * sensitive route in this system — it's what creates the ability to log in
 * at all. It must NEVER be reachable by the same credentials a staff
 * member uses, and it must never be exposed to the public frontend.
 *
 * This uses a separate trust boundary: a static service credential
 * (API key) sent in the x-internal-api-key request header, validated
 * against an env var on the server.
 *
 * ENV VAR LOOKUP ORDER
 * ─────────────────────────────────────────────────────────────────────────
 * The server-side key is read from the FIRST of these env vars that is set:
 *
 *   1. INTERNAL_PROVISIONING_API_KEY   ← canonical name (preferred)
 *   2. x-internal-api-key              ← accepted if Render / platform stored
 *                                         it under the header name by mistake
 *   3. X_INTERNAL_API_KEY              ← accepted if platform normalised the
 *                                         hyphens to underscores
 *
 * This means the app works regardless of which name was used in the
 * Render dashboard. The canonical name going forward is
 * INTERNAL_PROVISIONING_API_KEY — migrate to it when convenient by
 * adding it in the Render dashboard and removing the old key.
 *
 * HOW TO SEND THE KEY
 * ─────────────────────────────────────────────────────────────────────────
 * Always send it as the HTTP request header (never in the URL or body):
 *   x-internal-api-key: <your key value>
 *
 * PRODUCTION HARDENING beyond what's implemented here:
 *   - Replace the static key with mTLS or OAuth2 client-credentials.
 *   - Put this route behind a network boundary / IP allowlist so it
 *     is not reachable from the public internet at all.
 *   - Log every provisioning call to an immutable audit log.
 *   - Rotate the key regularly and store it in a secrets manager.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { timingSafeEqual } = require('./tokens');

/**
 * Resolve the expected API key from whichever env var name was used.
 * Returns null (and fails closed) if none is set.
 */
function getExpectedKey() {
  return process.env.INTERNAL_PROVISIONING_API_KEY
      || process.env['x-internal-api-key']
      || process.env.X_INTERNAL_API_KEY
      || null;
}

function isAuthorizedAdminRequest(req) {
  const provided = req.headers['x-internal-api-key'];
  const expected = getExpectedKey();

  if (!expected) {
    // Fail CLOSED — if no key is configured, nothing gets through.
    // Check that one of the three env var names above is set on Render.
    console.error(
      '[adminAuth] INTERNAL_PROVISIONING_API_KEY is not set. ' +
      'Set it in Render → Environment Variables (use the key name ' +
      'INTERNAL_PROVISIONING_API_KEY, not x-internal-api-key).'
    );
    return false;
  }

  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

module.exports = { isAuthorizedAdminRequest, getExpectedKey };
