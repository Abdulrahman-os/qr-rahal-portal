/**
 * Same algorithms as lib/security/payloadCrypto.js (RSA-SHA256 signing,
 * hybrid AES-256-GCM + RSA-OAEP encryption) but wired to the ephemeral
 * demo keypairs instead of real env-var-configured production keys.
 * This is what proves the *scheme* is correct — the production version
 * differs only in where the keys come from, not in the crypto itself.
 */
const crypto = require('crypto');
const keys = require('./demoKeys');

function canonicalize(obj) {
  return JSON.stringify(sortKeysDeep(obj));
}
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => { acc[k] = sortKeysDeep(value[k]); return acc; }, {});
  }
  return value;
}

function encryptFor(publicKeyPem, plaintextObj) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  );
  return {
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptWith(privateKeyPem, envelope) {
  const aesKey = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.encryptedKey, 'base64')
  );
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function signWith(privateKeyPem, plaintextObj) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonicalize(plaintextObj));
  signer.end();
  return signer.sign(privateKeyPem).toString('base64');
}

function verifyWith(publicKeyPem, plaintextObj, signatureBase64) {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(canonicalize(plaintextObj));
  verifier.end();
  return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, 'base64'));
}

module.exports = {
  keys,
  encryptFor, decryptWith, signWith, verifyWith,
};
