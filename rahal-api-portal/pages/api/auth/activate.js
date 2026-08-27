/**
 * POST /api/auth/activate
 * ─────────────────────────────────────────────────────────────────────────
 * The staff member's first-ever interaction with the system. They arrive
 * here via the activation link sent after provisioning. This endpoint:
 *
 *   1. Verifies the activation token (hash lookup, expiry, single-use)
 *   2. Re-verifies identity via DOB + passport (defense in depth — proves
 *      the person clicking the link is actually the staff member, not
 *      just someone who intercepted the email)
 *   3. Lets them set their own password (never assigned by an admin)
 *   4. Flips the account to ACTIVE
 *
 * This endpoint is public (no Bearer token required) by necessity — the
 * user has no session yet. Its security comes entirely from possession
 * of the single-use token + knowledge of DOB/passport, both required.
 * ─────────────────────────────────────────────────────────────────────────
 */
const storage = require('../../../lib/security/storage');
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

  const tokenHash = sha256(token);
  const tokenRecord = await storage.getActivationToken(tokenHash);

  // Deliberately identical error for "not found", "expired", and "used" —
  // don't help an attacker distinguish a guessed token from a real
  // expired one.
  const invalidTokenResponse = () => res.status(401).json({ code: 'ACTIVATION_TOKEN_INVALID', message: 'This activation link is invalid or has expired. Contact HR/IT to request a new one.' });

  if (!tokenRecord) return invalidTokenResponse();
  if (tokenRecord.usedAt) return invalidTokenResponse();
  if (Date.now() > tokenRecord.expiresAt) return invalidTokenResponse();

  const account = await storage.getStaffAccount(tokenRecord.staffNumber);
  if (!account) return invalidTokenResponse();
  if (account.status !== 'PENDING_ACTIVATION') {
    return res.status(409).json({ code: 'ALREADY_ACTIVATED', message: 'This account has already been activated. Use the login page instead.' });
  }

  // ── Identity re-verification ──
  if (account.dateOfBirth !== dateOfBirth || account.passportNumber !== passportNumber) {
    return res.status(401).json({ code: 'IDENTITY_VERIFICATION_FAILED', message: 'Date of birth or passport number does not match our records.' });
  }

  // ── Set password, activate account ──
  const passwordHash = await hashPassword(newPassword);
  await storage.updateStaffAccount(account.staffNumber, {
    passwordHash,
    status: 'ACTIVE',
    activatedAt: Date.now(),
  });
  await storage.markActivationTokenUsed(tokenHash);
  await storage.invalidateActivationTokensForStaff(account.staffNumber);

  return res.status(200).json({
    message: 'Account activated successfully. You may now log in.',
    staffNumber: account.staffNumber,
  });
}
