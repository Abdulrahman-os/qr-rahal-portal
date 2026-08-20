/**
 * GET /api/admin/auth-check  (TEMPORARY DIAGNOSTIC — remove after use)
 * ─────────────────────────────────────────────────────────────────────────
 * Answers exactly one question with certainty: is
 * INTERNAL_PROVISIONING_API_KEY actually configured on THIS running
 * server, and does the x-internal-api-key header you sent match it?
 *
 * NEVER reveals either actual value — only booleans. Safe to leave
 * briefly, but same rule as npm-audit.js: delete this file once
 * you've diagnosed the issue. A route that talks about auth secrets
 * at all is more attack surface than a finished app should carry.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { timingSafeEqual } = require('../../../lib/security/tokens');

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use GET' });

  const expected = process.env.INTERNAL_PROVISIONING_API_KEY;
  const provided = req.headers['x-internal-api-key'];

  const serverHasKeyConfigured = !!expected;
  const headerWasSent = !!provided;
  const keysMatch = serverHasKeyConfigured && headerWasSent
    ? timingSafeEqual(provided, expected)
    : false;

  // Length-only hints — genuinely useful for catching "pasted with a
  // trailing newline" or "pasted with surrounding quotes" style bugs,
  // without revealing any actual character of either value.
  return res.status(200).json({
    serverHasKeyConfigured,
    headerWasSent,
    keysMatch,
    expectedKeyLength: serverHasKeyConfigured ? expected.length : null,
    providedKeyLength: headerWasSent ? provided.length : null,
    diagnosis: !serverHasKeyConfigured
      ? 'INTERNAL_PROVISIONING_API_KEY is NOT set on this server — check Render env vars, confirm Save was clicked, confirm this exact deploy happened AFTER saving.'
      : !headerWasSent
      ? 'No x-internal-api-key header was received — check your curl command includes -H "x-internal-api-key: ..." exactly.'
      : keysMatch
      ? 'Match confirmed — this key is valid and should work on other admin endpoints.'
      : 'Server has a key configured and you sent one, but they do not match — check for extra whitespace, quotes, or a stale copy-paste on either side. Compare expectedKeyLength vs providedKeyLength above for a hint.',
  });
}
