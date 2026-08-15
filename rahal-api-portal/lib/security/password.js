const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12; // 2026 baseline; bump if hardware allows without hurting login latency too much

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

async function verifyPassword(plaintext, hash) {
  if (!hash) return false; // account not yet activated (no password set)
  return bcrypt.compare(plaintext, hash);
}

function isPasswordStrongEnough(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return false;
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

module.exports = { hashPassword, verifyPassword, isPasswordStrongEnough };
