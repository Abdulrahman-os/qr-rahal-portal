/**
 * PAYLOAD SIGNING + ENCRYPTION — for calls to the real RAHAL backend
 * ─────────────────────────────────────────────────────────────────────────
 * IT's requirement was: "Request payloads need to be signed and
 * encrypted, in addition to BA and TLS. You also need to decrypt and
 * validate the signatures of any responses."
 *
 * That's four layers total on every call:
 *   1. TLS                — transport encryption (handled by https:// + Node's
 *                            fetch/https module automatically; nothing to
 *                            code here beyond using https:// URLs)
 *   2. Basic Auth (BA)    — `Authorization: Basic base64(clientId:clientSecret)`
 *                            header, identifies OUR service to RAHAL
 *   3. Payload encryption — the JSON body itself is encrypted so it's opaque
 *                            even if TLS were somehow terminated early
 *                            (e.g. by an intermediate proxy)
 *   4. Payload signing    — proves the payload came from us and wasn't
 *                            tampered with, independent of encryption
 *
 * ENCRYPTION SCHEME (hybrid, standard for this kind of integration):
 *   - Generate a random AES-256-GCM content key per request
 *   - Encrypt the JSON payload with that AES key (fast, handles any size)
 *   - Encrypt the AES key itself with RAHAL's RSA public key (RSA-OAEP)
 *   - Send both: { encryptedKey, iv, authTag, ciphertext }
 *   This is the same pattern JWE uses — AES does the bulk work, RSA only
 *   wraps a small key, which is what RSA is actually good at.
 *
 * SIGNING SCHEME:
 *   - RSA-SHA256 signature over the *plaintext* payload (sign before
 *     encrypting, verify after decrypting) using OUR private signing key
 *   - RAHAL verifies with OUR public signing key (which we'd register
 *     with them during onboarding)
 *   - We verify RAHAL's responses the same way, in reverse, using
 *     RAHAL's public signing key
 *
 * NOTE: signing and encryption use SEPARATE keypairs from each other,
 * and separate again from the JWT keypair in lib/security/jwt.js.
 * Don't reuse keys across purposes — if one is ever compromised, the
 * blast radius should be limited to that one function.
 *
 * WHERE THE ACTUAL KEYS COME FROM:
 * None of the key material below is generated or guessed by this code.
 * Every key is read from an environment variable that YOUR IT contact
 * must provide through whatever secure exchange process they specify
 * (commonly: you generate your own keypair, send them your PUBLIC key
 * + CSR; they send back their PUBLIC key + your signed client cert).
 * Never accept a private key over email/Slack — only your own
 * generated one, kept local, ever leaves your machine as a public key.
 * ─────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required env var ${name}. This must be provided by Qatar Airways IT ` +
      `as part of the RAHAL integration onboarding — see IT_INTEGRATION_REQUEST.md. ` +
      `Do not fabricate or guess this value.`
    );
  }
  return val.includes('BEGIN') ? val.replace(/\\n/g, '\n') : val;
}

// ── Basic Auth header (layer 2) ─────────────────────────────────────────
function buildBasicAuthHeader() {
  const clientId = requireEnv('RAHAL_BA_CLIENT_ID');
  const clientSecret = requireEnv('RAHAL_BA_CLIENT_SECRET');
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${token}`;
}

// ── Encrypt outbound payload for RAHAL (layer 3) ────────────────────────
// Uses RAHAL's PUBLIC encryption key — they hold the matching private key.
function encryptPayload(plaintextObj) {
  const rahalPublicKey = requireEnv('RAHAL_ENCRYPTION_PUBLIC_KEY');

  const aesKey = crypto.randomBytes(32); // AES-256
  const iv = crypto.randomBytes(12);     // GCM standard IV size

  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedKey = crypto.publicEncrypt(
    { key: rahalPublicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  );

  return {
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

// ── Decrypt inbound response from RAHAL (reverse of layer 3) ───────────
// Uses OUR PRIVATE encryption key — only we can decrypt what was
// encrypted for us with our public key.
function decryptPayload(envelope) {
  const ourPrivateKey = requireEnv('CLIENT_ENCRYPTION_PRIVATE_KEY');

  const aesKey = crypto.privateDecrypt(
    { key: ourPrivateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.encryptedKey, 'base64')
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(), // throws if authTag doesn't match — tamper detection built in
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

// ── Sign outbound payload (layer 4, our side) ───────────────────────────
// Uses OUR PRIVATE signing key.
function signPayload(plaintextObj) {
  const ourPrivateSigningKey = requireEnv('CLIENT_SIGNING_PRIVATE_KEY');
  const canonical = canonicalize(plaintextObj);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonical);
  signer.end();
  return signer.sign(ourPrivateSigningKey).toString('base64');
}

// ── Verify inbound response signature (layer 4, RAHAL's side) ──────────
// Uses RAHAL's PUBLIC signing key.
function verifySignature(plaintextObj, signatureBase64) {
  const rahalPublicSigningKey = requireEnv('RAHAL_SIGNING_PUBLIC_KEY');
  const canonical = canonicalize(plaintextObj);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(canonical);
  verifier.end();
  return verifier.verify(rahalPublicSigningKey, Buffer.from(signatureBase64, 'base64'));
}

// Deterministic JSON stringify — sorts keys so the same logical payload
// always produces the same bytes to sign/verify, regardless of key
// insertion order. Signing raw JSON.stringify output without this is a
// common bug: two semantically-identical objects can serialize
// differently and fail signature verification for no real reason.
function canonicalize(obj) {
  return JSON.stringify(sortKeysDeep(obj));
}
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = sortKeysDeep(value[k]);
      return acc;
    }, {});
  }
  return value;
}

module.exports = {
  buildBasicAuthHeader,
  encryptPayload,
  decryptPayload,
  signPayload,
  verifySignature,
};
