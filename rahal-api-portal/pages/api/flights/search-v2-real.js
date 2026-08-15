/**
 * POST /api/flights/search  (v2 — real RAHAL backend)
 * ─────────────────────────────────────────────────────────────────────────
 * Worked example of swapping a route from the mock implementation
 * (pages/api/flights/search.js) to the real backend via rahalClient.
 * Use this as the template for migrating every other route once IT
 * confirms the actual RAHAL API request/response schema — the shapes
 * below (body passed to callRahal, fields read from the response) are
 * assumptions based on our current mock contract and WILL need
 * adjusting to match RAHAL's real API spec when it's shared.
 *
 * Everything security-related (BA header, encryption, signing,
 * decryption, signature verification) is handled by rahalClient and
 * does not need to be repeated here or in any other migrated route.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { requireAuth } = require('../../../lib/security/requireAuth');
const { callRahal } = require('../../../lib/rahalClient');

export default async function handler(req, res) {
  const user = requireAuth(req);
  if (!user) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Valid Bearer token required.' });
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { tripType, origin, destination, departureDate, returnDate, ticketType, passengers } = req.body || {};
  if (!origin || !destination || !departureDate) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'origin, destination and departureDate are required.' });
  }

  try {
    // TODO once IT confirms the real endpoint path and payload shape —
    // this is our best-guess mapping from the current mock contract.
    const result = await callRahal('/flights/search', 'POST', {
      staffNumber: user.sub,
      tripType, origin, destination, departureDate, returnDate, ticketType, passengers,
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json(err.body || { code: 'RAHAL_BACKEND_ERROR', message: err.message });
    }
    console.error('RAHAL backend call failed:', err.message);
    return res.status(502).json({ code: 'RAHAL_BACKEND_UNREACHABLE', message: 'Could not reach RAHAL backend services.' });
  }
}
