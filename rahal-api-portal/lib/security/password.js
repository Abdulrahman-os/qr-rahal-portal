/**
 * Password hashing + validation
 * ─────────────────────────────────────────────────────────────────────────
 * Policy matches RAHAL's own "Change Password" screen (User Guide v1.0 §2.3):
 *   • At least 8 characters
 *   • Upper AND lower case alphabets
 *   • Digits
 *   • Special characters
 * ─────────────────────────────────────────────────────────────────────────
 */
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

async function verifyPassword(plaintext, hash) {
  if (!hash) return false;
  return bcrypt.compare(plaintext, hash);
}

/**
 * Validates against RAHAL's confirmed password policy (§2.3 user guide):
 *   - Minimum 8 characters
 *   - Upper + lower case
 *   - At least one digit
 *   - At least one special character
 */
function isPasswordStrongEnough(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return false;
  const hasUpper   = /[A-Z]/.test(pw);
  const hasLower   = /[a-z]/.test(pw);
  const hasDigit   = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

/**
 * Human-readable breakdown of which password rules are failing.
 * Used to populate client-side validation messages.
 */
function passwordPolicyErrors(pw) {
  if (typeof pw !== 'string') return ['Password must be a string.'];
  const errors = [];
  if (pw.length < 8)         errors.push('At least 8 characters required.');
  if (!/[A-Z]/.test(pw))    errors.push('Must contain at least one uppercase letter.');
  if (!/[a-z]/.test(pw))    errors.push('Must contain at least one lowercase letter.');
  if (!/[0-9]/.test(pw))    errors.push('Must contain at least one digit.');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('Must contain at least one special character.');
  return errors;
}

module.exports = { hashPassword, verifyPassword, isPasswordStrongEnough, passwordPolicyErrors };
