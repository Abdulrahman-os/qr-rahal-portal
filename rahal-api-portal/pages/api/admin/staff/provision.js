/**
 * POST /api/admin/staff/provision
 * ─────────────────────────────────────────────────────────────────────────
 * Creates a staff account on the RAHAL frontend, then issues a single-use
 * activation token for the staff member to complete first-login setup.
 *
 * Callable only by an authorized internal system via x-internal-api-key.
 * Staff account data is persisted to https://stafftravel.qatarairways.com.qa
 * via lib/rahalStaffClient.js — this portal holds no shadow copy.
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../../lib/security/storage');
const rahalStaff = require('../../../../lib/rahalStaffClient');
const { generateOpaqueToken } = require('../../../../lib/security/tokens');
const { isAuthorizedAdminRequest } = require('../../../../lib/security/adminAuth');
const { checkRateLimit, getClientIp } = require('../../../../lib/security/rateLimit');

const ACTIVATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  }

  if (!isAuthorizedAdminRequest(req)) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing or invalid internal API key.' });
  }

  const rl = checkRateLimit(`provision:${getClientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
    return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many provisioning requests. Try again shortly.' });
  }

  const {
    staffNumber, staffType, firstName, lastName,
    email, mobile, dateOfBirth, passportNumber, createdBy,
  } = req.body || {};

  const errors = [];
  if (!staffNumber || !/^[A-Za-z0-9]{4,12}$/.test(staffNumber)) errors.push({ field: 'staffNumber', message: 'Required, alphanumeric, 4-12 chars.' });
  if (!['FORMER_STAFF', 'QAA_QEEL'].includes(staffType))         errors.push({ field: 'staffType',   message: 'Must be FORMER_STAFF or QAA_QEEL.' });
  if (!firstName)                                                  errors.push({ field: 'firstName',   message: 'Required.' });
  if (!lastName)                                                   errors.push({ field: 'lastName',    message: 'Required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))       errors.push({ field: 'email',        message: 'Valid email required.' });
  if (!isValidDate(dateOfBirth))                                   errors.push({ field: 'dateOfBirth', message: 'Required, format YYYY-MM-DD.' });
  if (!passportNumber || passportNumber.length < 5)               errors.push({ field: 'passportNumber', message: 'Required.' });
  if (!createdBy)                                                  errors.push({ field: 'createdBy',   message: 'Required — identifies provisioning system/admin for audit.' });

  if (errors.length) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'One or more fields failed validation.', errors });
  }

  // ── Check for existing account ──
  let existing;
  try {
    existing = await rahalStaff.getStaffAccount(staffNumber);
  } catch (err) {
    return res.status(502).json({ code: 'RAHAL_FRONTEND_ERROR', message: `Could not verify staff account: ${err.message}` });
  }
  if (existing) {
    return res.status(409).json({ code: 'DUPLICATE_STAFF_NUMBER', message: `Staff number ${staffNumber} is already provisioned.` });
  }

  // ── Create account on RAHAL frontend ──
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
    await rahalStaff.createStaffAccount(record);
  } catch (err) {
    if (err.code === 'DUPLICATE_STAFF_NUMBER') {
      return res.status(409).json({ code: 'DUPLICATE_STAFF_NUMBER', message: `Staff number ${staffNumber} is already provisioned.` });
    }
    return res.status(502).json({ code: 'RAHAL_FRONTEND_ERROR', message: `Failed to provision account: ${err.message}` });
  }

  // ── Issue activation token (portal-local, 72-hour TTL) ──
  const { raw, hash } = generateOpaqueToken(32);
  await storage.saveActivationToken(hash, {
    staffNumber,
    expiresAt: Date.now() + ACTIVATION_TOKEN_TTL_MS,
  });

  const activationLink = `https://stafftravel.qatarairways.com.qa/activate?token=${raw}`;

  return res.status(201).json({
    staffNumber,
    status: 'PENDING_ACTIVATION',
    activationLink,
    activationTokenExpiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS).toISOString(),
    message: 'Staff account provisioned. Deliver the activation link to the staff member via a verified channel.',
  });
}
