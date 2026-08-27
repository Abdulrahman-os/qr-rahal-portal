/**
 * POST /api/auth/activate
 * ─────────────────────────────────────────────────────────────────────────
 * Staff member's first-ever interaction — arrives via the activation link.
 * 1. Verifies the activation token (portal-local, single-use, 72-hour TTL)
 * 2. Re-verifies identity via DOB + passport against RAHAL frontend record
 * 3. Sets password and flips account to ACTIVE on the RAHAL frontend
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../lib/security/storage');
const rahalStaff = require('../../../lib/rahalStaffClient');
const { sha256 } = require('../../../lib/security/tokens');
const { hashPassword, isPasswordStrongEnough } = require('../../../lib/security/password');
const { checkRateLimit, getClientIp } = require('../../../lib/security/rateLimit');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  }

  const rl = checkRateLimit(`activate:${getClientIp(req)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
    return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' });
  }

  const { token, dateOfBirth, passportNumber, newPassword, confirmPassword } = req.body || {};

  if (!token || !dateOfBirth || !passportNumber || !newPassword || !confirmPassword) {
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'token, dateOfBirth, passportNumber, newPassword and confirmPassword are all required.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(422).json({ code: 'PASSWORD_MISMATCH', message: 'Passwords do not match.' });
  }
  if (!isPasswordStrongEnough(newPassword)) {
    return res.status(422).json({ code: 'PASSWORD_TOO_WEAK', message: 'Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character.' });
  }

  const invalidToken = () => res.status(401).json({
    code: 'ACTIVATION_TOKEN_INVALID',
    message: 'This activation link is invalid or has expired. Contact HR/IT to request a new one.',
  });

  const tokenHash = sha256(token);
  const tokenRecord = await storage.getActivationToken(tokenHash);
  if (!tokenRecord)           return invalidToken();
  if (tokenRecord.usedAt)     return invalidToken();
  if (Date.now() > tokenRecord.expiresAt) return invalidToken();

  // ── Fetch account from RAHAL frontend ──
  let account;
  try {
    account = await rahalStaff.getStaffAccount(tokenRecord.staffNumber);
  } catch (err) {
    return res.status(502).json({ code: 'RAHAL_FRONTEND_ERROR', message: `Could not fetch account: ${err.message}` });
  }
  if (!account) return invalidToken();

  if (account.status !== 'PENDING_ACTIVATION') {
    return res.status(409).json({ code: 'ALREADY_ACTIVATED', message: 'This account has already been activated. Use the login page instead.' });
  }

  // ── Identity re-verification ──
  if (account.dateOfBirth !== dateOfBirth || account.passportNumber !== passportNumber) {
    return res.status(401).json({ code: 'IDENTITY_VERIFICATION_FAILED', message: 'Date of birth or passport number does not match our records.' });
  }

  // ── Set password, activate on RAHAL frontend ──
  const passwordHash = await hashPassword(newPassword);
  try {
    await rahalStaff.updateStaffAccount(account.staffNumber, {
      passwordHash,
      status: 'ACTIVE',
      activatedAt: Date.now(),
    });
  } catch (err) {
    return res.status(502).json({ code: 'RAHAL_FRONTEND_ERROR', message: `Failed to activate account: ${err.message}` });
  }

  await storage.markActivationTokenUsed(tokenHash);
  await storage.invalidateActivationTokensForStaff(account.staffNumber);

  return res.status(200).json({
    message: 'Account activated successfully. You may now log in.',
    staffNumber: account.staffNumber,
  });
}
