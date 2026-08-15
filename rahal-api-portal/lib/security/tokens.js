const crypto = require('crypto');

/**
 * Generates a cryptographically random URL-safe token.
 * Returns { raw, hash } — only `hash` is ever persisted to storage.
 * `raw` is sent to the user exactly once (in the activation link /
 * email) and never stored or logged anywhere.
 */
function generateOpaqueToken(bytes = 32) {
  const raw = crypto.randomBytes(bytes).toString('base64url');
  const hash = sha256(raw);
  return { raw, hash };
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks when
 * checking submitted tokens/OTPs against stored hashes.
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid leaking length via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function generateNumericOtp(digits = 6) {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(digits, '0');
}

module.exports = { generateOpaqueToken, sha256, timingSafeEqual, generateNumericOtp };
