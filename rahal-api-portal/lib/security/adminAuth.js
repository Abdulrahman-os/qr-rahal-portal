/**
 * ADMIN / SYSTEM AUTHENTICATION FOR PROVISIONING
 * ─────────────────────────────────────────────────────────────────────────
 * The provisioning endpoint (POST /api/admin/staff/provision) is the most
 * sensitive route in this system — it's what creates the ability to log in
 * at all. It must NEVER be reachable by the same credentials a staff
 * member uses, and it must never be exposed to the public frontend.
 *
 * This uses a separate trust boundary: a static service credential
 * (API key) issued only to the internal system that's authorized to
 * provision accounts — typically your HRIS integration (SAP
 * SuccessFactors / Workday feed) or an internal admin tool running on
 * a private network / VPN, NOT the public stafftravel.qatarairways.com.qa
 * frontend.
 *
 * PRODUCTION HARDENING beyond what's implemented here:
 *   - Replace the static API key with mTLS (mutual TLS) between the
 *     HRIS system and this service, or an OAuth2 client-credentials
 *     grant with short-lived tokens — a static key is the minimum bar,
 *     not the ceiling.
 *   - Put this route behind a network boundary (VPC-internal endpoint,
 *     IP allowlist, or VPN) in addition to the API key, so it's not
 *     reachable from the public internet at all.
 *   - Log every provisioning call to an immutable audit log (who
 *     provisioned which staffNumber, when, from which source IP) —
 *     this is a compliance requirement for most HR data handling.
 *   - Rotate the API key regularly and store it in a secrets manager,
 *     never in source control or a plain env var checked into git.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { timingSafeEqual } = require('./tokens');

function isAuthorizedAdminRequest(req) {
  const provided = req.headers['x-internal-api-key'];
  const expected = process.env.INTERNAL_PROVISIONING_API_KEY;

  if (!expected) {
    // Fail CLOSED if the key isn't configured — never fall back to "open"
    return false;
  }
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

module.exports = { isAuthorizedAdminRequest };
