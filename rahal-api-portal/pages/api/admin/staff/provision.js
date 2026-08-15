/**
 * POST /api/admin/staff/provision
 * ─────────────────────────────────────────────────────────────────────────
 * Creates a staff account BEFORE the staff member has ever logged in.
 * This is the pre-registration step. It must be called only by an
 * authorized internal system (HRIS feed, admin console) — see
 * lib/security/adminAuth.js for the trust boundary.
 *
 * Design decisions worth calling out:
 *   - No password is set here. The account is created in
 *     PENDING_ACTIVATION status with password_hash = NULL, so it is
 *     structurally impossible to log in until activation completes.
 *   - dateOfBirth + passportNumber are captured now because they're
 *     used later as the identity-verification challenge during first
 *     login (mirrors the "security detail" step in the real RAHAL UI).
 *   - Returns an activation token ONCE, in the response, for the
 *     calling system to email/SMS to the staff member. The raw token
 *     is never stored — only its SHA-256 hash — so a database leak
 *     later cannot be used to activate accounts.
 *   - Token expires in 72 hours, consistent with typical HR onboarding
 *     SLAs; tune to your policy.
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../../lib/security/storage');
const { generateOpaqueToken } = require('../../../../lib/security/tokens');
const { isAuthorizedAdminRequest } = require('../../../../lib/security/adminAuth');
const { checkRateLimit, getClientIp } = require('../../../../lib/security/rateLimit');

const ACTIVATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  }

  // ── Trust boundary: only the authorized internal system may call this ──
  if (!isAuthorizedAdminRequest(req)) {
    // Deliberately generic message — don't reveal whether the key was
    // missing vs wrong, and don't distinguish "not configured" from
    // "wrong key" to an external caller.
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing or invalid internal API key.' });
  }

  // ── Rate limit even authorized callers — defends against a compromised
  //    or misbehaving internal integration hammering this endpoint ──
  const rl = checkRateLimit(`provision:${getClientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
    return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many provisioning requests. Try again shortly.' });
  }

  const {
    staffNumber, staffType, firstName, lastName,
    email, mobile, dateOfBirth, passportNumber,
    createdBy, // identity of the calling system/admin, for audit trail
  } = req.body || {};

  // ── Validation ──
  const errors = [];
  if (!staffNumber || !/^[A-Za-z0-9]{4,12}$/.test(staffNumber)) errors.push({ field: 'staffNumber', message: 'Required, alphanumeric, 4-12 chars.' });
  if (!['FORMER_STAFF', 'QAA_QEEL'].includes(staffType)) errors.push({ field: 'staffType', message: 'Must be FORMER_STAFF or QAA_QEEL.' });
  if (!firstName) errors.push({ field: 'firstName', message: 'Required.' });
  if (!lastName) errors.push({ field: 'lastName', message: 'Required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: 'email', message: 'Valid email required.' });
  if (!isValidDate(dateOfBirth)) errors.push({ field: 'dateOfBirth', message: 'Required, format YYYY-MM-DD.' });
  if (!passportNumber || passportNumber.length < 5) errors.push({ field: 'passportNumber', message: 'Required.' });
  if (!createdBy) errors.push({ field: 'createdBy', message: 'Required — identifies the provisioning system/admin for audit.' });

  if (errors.length) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'One or more fields failed validation.', errors });
  }

  const existing = await storage.getStaffAccount(staffNumber);
  if (existing) {
    return res.status(409).json({ code: 'DUPLICATE_STAFF_NUMBER', message: `Staff number ${staffNumber} is already provisioned.` });
  }

  // ── Create account: PENDING_ACTIVATION, no password ──
  const record = {
    staffNumber, staffType, firstName, lastName,
    email, mobile: mobile || null,
    dateOfBirth, passportNumber,
    passwordHash: null,
    status: 'PENDING_ACTIVATION',
    failedLoginCount: 0,
    lockedUntil: null,
    createdBy,
    createdAt: Date.now(),
    activatedAt: null,
  };

  try {
    await storage.createStaffAccount(record);
  } catch (err) {
    if (err.code === 'DUPLICATE_STAFF_NUMBER') {
      return res.status(409).json({ code: 'DUPLICATE_STAFF_NUMBER', message: `Staff number ${staffNumber} is already provisioned.` });
    }
    throw err;
  }

  // ── Issue activation token — raw value returned ONCE, only hash stored ──
  const { raw, hash } = generateOpaqueToken(32);
  await storage.saveActivationToken(hash, {
    staffNumber,
    expiresAt: Date.now() + ACTIVATION_TOKEN_TTL_MS,
    usedAt: null,
  });

  // In production: send `raw` via the staff member's HR-verified email
  // through a transactional email service (SES/SendGrid), constructing
  // a link like:
  //   https://stafftravel.qatarairways.com.qa/activate?token=<raw>
  // Never log `raw` to application logs or return it in a response that
  // isn't going straight back to the trusted provisioning system.
  const activationLink = `https://stafftravel.qatarairways.com.qa/activate?token=${raw}`;

  return res.status(201).json({
    staffNumber,
    status: 'PENDING_ACTIVATION',
    activationLink,          // caller's integration is responsible for delivering this via email/SMS
    activationTokenExpiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS).toISOString(),
    message: 'Staff account provisioned. Deliver the activation link to the staff member via a verified channel.',
  });
}
