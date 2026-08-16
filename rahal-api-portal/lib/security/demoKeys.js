/**
 * DEMO-ONLY KEYS — for proving the sign/encrypt/verify pipeline works,
 * end-to-end, without touching any real backend or requiring you to
 * configure real credentials first.
 *
 * These are NOT your production CLIENT_ and RAHAL_ prefixed keys from
 * payloadCrypto.js. Two separate ephemeral keypairs are generated here
 * at server boot — one representing "us", one representing a "mock
 * RAHAL counterparty" — so the demo can exercise a full two-party
 * exchange against itself, safely, on every deploy.
 *
 * Regenerates on every cold start, same tradeoff as the JWT demo keys
 * in lib/security/jwt.js — fine here since this is explicitly a demo,
 * never fine for the real production key vars.
 */
const crypto = require('crypto');

function generateKeypair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
}

const g = globalThis;
if (!g.__rahal_demo_keys) {
  g.__rahal_demo_keys = {
    ourSigning: generateKeypair(),
    ourEncryption: generateKeypair(),
    mockRahalSigning: generateKeypair(),
    mockRahalEncryption: generateKeypair(),
  };
}

module.exports = g.__rahal_demo_keys;
