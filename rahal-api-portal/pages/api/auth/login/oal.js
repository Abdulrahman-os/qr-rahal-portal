/**
 * POST /api/auth/login/oal  (v2 — real JWT issuance)
 * ─────────────────────────────────────────────────────────────────────────
 * Upgraded from the original mock-tier token (lib/mockStore.generateToken)
 * to a real RS256-signed JWT, so OAL sessions go through the same
 * verification path (lib/security/requireAuth.js) as staff sessions.
 *
 * OAL gets the narrow ROLES.OAL scope set (read-only, no booking
 * creation, no refunds — see lib/security/roles.js) PLUS a
 * ticket-scoped claim: `scopedToTicket`. Having BOOKINGS_READ in the
 * scope list only proves the token can read *some* booking — it's the
 * `scopedToTicket` claim that a route must additionally check to
 * confirm it's reading the ONE booking this OAL session is allowed to
 * see. That resource-level check has to happen per-route (compare
 * `payload.scopedToTicket` against the ticket/PNR being requested) —
 * this route only issues the claim, it doesn't enforce it everywhere
 * yet. See lib/security/requireAuth.js for the scope-checking helper.
 *
 * No refresh token for OAL sessions (unlike staff) — kept as a single
 * 1-hour access token, matching the original design's simpler,
 * shorter-lived, single-purpose nature of an OAL session.
 * ─────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const { validateCaptcha } = require('../../../../lib/mockStore');
const { signAccessToken } = require('../../../../lib/security/jwt');
const { ROLES, scopesForRole } = require('../../../../lib/security/roles');

const VALID_OAL = {
  '157-1234567890': { lastName: 'Al-Rashidi', name: 'Ahmed Al-Rashidi', airline: 'EK' },
  '157-9876543210': { lastName: 'Smith', name: 'John Smith', airline: 'BA' },
};

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { ticketNumber, lastName, captchaToken, captchaCode } = req.body || {};

  if (!ticketNumber || !lastName || !captchaToken || !captchaCode)
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'ticketNumber, lastName, captchaToken and captchaCode are required.' });

  if (!validateCaptcha(captchaToken, captchaCode))
    return res.status(422).json({ code: 'CAPTCHA_INVALID', message: 'CAPTCHA code is incorrect or expired.' });

  const staff = VALID_OAL[ticketNumber];
  if (!staff || staff.lastName.toLowerCase() !== lastName.toLowerCase())
    return res.status(401).json({ code: 'AUTH_FAILED', message: 'Invalid ticket number or last name.' });

  const role = ROLES.OAL;
  const scopes = scopesForRole(role);

  const accessToken = signAccessToken({
    sub: ticketNumber,          // OAL has no staff number — the ticket IS the identity
    staffType: 'OAL',
    name: staff.name,
    role,
    scopes,
    scopedToTicket: ticketNumber, // resource-level restriction — see header comment
    jti: crypto.randomUUID(),
  });

  return res.status(200).json({
    accessToken,
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    staffType: 'OAL',
    displayName: staff.name,
    airline: staff.airline,
    role,
    scopes,
    scopedToTicket: ticketNumber,
  });
}

