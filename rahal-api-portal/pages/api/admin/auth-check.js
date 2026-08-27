/**
 * GET /api/admin/auth-check
 * ─────────────────────────────────────────────────────────────────────────
 * Diagnostic route — verifies that INTERNAL_PROVISIONING_API_KEY is set on
 * the server AND that the key you send in the header matches it.
 *
 * Returns only booleans and lengths — never the actual key values.
 *
 * DELETE THIS FILE once you have confirmed provisioning works in production.
 * It has no place in a long-term deployment.
 *
 * Usage:
 *   curl -H "x-internal-api-key: YOUR_KEY" https://your-app.onrender.com/api/admin/auth-check
 *
 * Successful response:
 *   { "serverKeyConfigured": true, "headerProvided": true, "match": true,
 *     "serverKeyLength": 44, "providedKeyLength": 44,
 *     "activeEnvVar": "INTERNAL_PROVISIONING_API_KEY" }
 *
 * Common failure responses and what they mean:
 *   serverKeyConfigured: false  → The env var is not set on Render at all.
 *                                 Add INTERNAL_PROVISIONING_API_KEY in
 *                                 Render → Environment Variables and redeploy.
 *   headerProvided: false       → You forgot to send x-internal-api-key header.
 *   match: false                → Lengths will differ if you pasted the wrong
 *                                 key; same length usually means trailing
 *                                 whitespace or quote characters crept in.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { getExpectedKey } = require('../../../lib/security/adminAuth');
const { timingSafeEqual } = require('../../../lib/security/tokens');

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use GET' });
  }

  const provided = (req.headers['x-internal-api-key'] || '').trim();
  const expected = getExpectedKey();

  // Which env var name resolved?
  const activeEnvVar = process.env.INTERNAL_PROVISIONING_API_KEY
    ? 'INTERNAL_PROVISIONING_API_KEY'
    : process.env['x-internal-api-key']
    ? 'x-internal-api-key'
    : process.env.X_INTERNAL_API_KEY
    ? 'X_INTERNAL_API_KEY'
    : null;

  const serverKeyConfigured = Boolean(expected);
  const headerProvided      = provided.length > 0;
  const match               = serverKeyConfigured && headerProvided
                              && timingSafeEqual(provided, expected);

  return res.status(200).json({
    serverKeyConfigured,
    headerProvided,
    match,
    serverKeyLength:   expected  ? expected.length  : 0,
    providedKeyLength: provided  ? provided.length  : 0,
    activeEnvVar,
    // Hint surfaced only when the key is missing or mismatched
    ...(!match && {
      hint: !serverKeyConfigured
        ? 'Set INTERNAL_PROVISIONING_API_KEY in Render → Environment Variables, then redeploy.'
        : !headerProvided
        ? 'Send the key in the x-internal-api-key request header.'
        : expected.length !== provided.length
        ? `Length mismatch (server=${expected.length}, sent=${provided.length}). ` +
          'Check for extra spaces, quotes, or newlines when you copied the key.'
        : 'Lengths match but values differ. Ensure you are sending the exact key ' +
          'stored in Render, with no extra characters.',
    }),
  });
}
