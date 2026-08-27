/**
 * POST /api/admin/staff/provision
 * ─────────────────────────────────────────────────────────────────────────
 * Creates a portal-side staff record so the staff member can then
 * activate their account and log in.
 *
 * Callable only by an authorized internal system via x-internal-api-key.
 *
 * NOTE ON RAHAL INTEGRATION
 * ─────────────────────────────────────────────────────────────────────────
 * Staff accounts ultimately live in RAHAL (stafftravel.qatarairways.com.qa).
 * RAHAL is currently UI-only with no REST API (see API_REQUEST_ESCALATION.md
 * and IT_INTEGRATION_REQUEST.md). Until IT delivers an API, this endpoint
 * maintains a portal-local record in storage.js — a lightweight index that
 * tracks which staff numbers have been provisioned and their activation state.
 *
 * When RAHAL gains an API, replace the storage.createStaffAccount() call
 * below with rahalStaffClient.createStaffAccount() and use storage only
 * for the activation token. Nothing else in this file needs to change.
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
  if (!staffNumber || !/^[A-Za-z0-9]{4,12}$/.test(staffNumber)) errors.push({ field: 'staffNumber',   message: 'Required, alphanumeric, 4–12 chars.' });
  if (!['FORMER_STAFF','QAA_QEEL'].includes(staffType))          errors.push({ field: 'staffType',     message: 'Must be FORMER_STAFF or QAA_QEEL.' });
  if (!firstName)                                                  errors.push({ field: 'firstName',    message: 'Required.' });
  if (!lastName)                                                   errors.push({ field: 'lastName',     message: 'Required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))       errors.push({ field: 'email',         message: 'Valid email required.' });
  if (!isValidDate(dateOfBirth))                                   errors.push({ field: 'dateOfBirth',  message: 'Required, format YYYY-MM-DD.' });
  if (!passportNumber || passportNumber.length < 5)               errors.push({ field: 'passportNumber', message: 'Required, min 5 chars.' });
  if (!createdBy)                                                  errors.push({ field: 'createdBy',    message: 'Required — identifies provisioning system/admin for audit.' });

  if (errors.length) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'One or more fields failed validation.', errors });
  }

  // ── Duplicate check (local storage) ──────────────────────────────────────
  // Using storage.js because RAHAL has no REST API yet.
  // When RAHAL's API is available, swap this for rahalStaffClient.getStaffAccount().
  let existing;
  try {
    existing = await storage.getStaffAccount(staffNumber);
  } catch (err) {
    return res.status(500).json({ code: 'STORAGE_ERROR', message: `Duplicate check failed: ${err.message}` });
  }
  if (existing) {
    return res.status(409).json({ code: 'DUPLICATE_STAFF_NUMBER', message: `Staff number ${staffNumber} is already provisioned.` });
  }

  // ── Persist record (local storage) ───────────────────────────────────────
  const record = {
    staffNumber, staffType, firstName, lastName,
    email, mobile: mobile || null,
    dateOfBirth, passportNumber,
    passwordHash:      null,
    status:            'PENDING_ACTIVATION',
    failedLoginCount:  0,
    lockedUntil:       null,
    createdBy,
    createdAt:         Date.now(),
    activatedAt:       null,
  };

  try {
    await storage.createStaffAccount(record);
  } catch (err) {
    if (err.code === 'DUPLICATE_STAFF_NUMBER') {
      return res.status(409).json({ code: 'DUPLICATE_STAFF_NUMBER', message: `Staff number ${staffNumber} is already provisioned.` });
    }
    return res.status(500).json({ code: 'STORAGE_ERROR', message: `Failed to save account: ${err.message}` });
  }

  // ── Issue activation token (72-hour TTL) ─────────────────────────────────
  const { raw, hash } = generateOpaqueToken(32);
  try {
    await storage.saveActivationToken(hash, {
      staffNumber,
      expiresAt: Date.now() + ACTIVATION_TOKEN_TTL_MS,
    });
  } catch (err) {
    return res.status(500).json({ code: 'STORAGE_ERROR', message: `Failed to save activation token: ${err.message}` });
  }

  const activationLink = `https://stafftravel.qatarairways.com.qa/activate?token=${raw}`;

  return res.status(201).json({
    staffNumber,
    status: 'PENDING_ACTIVATION',
    activationLink,
    activationTokenExpiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS).toISOString(),
    message: 'Staff account provisioned. Send the activation link to the staff member via a verified channel.',
  });
}
