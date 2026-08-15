/**
 * rahalClient — the ONLY place in this codebase that should ever call
 * the real RAHAL backend. Every route handler goes through this
 * instead of using fetch/axios directly, so the security pipeline
 * (BA + TLS + encrypt + sign, and decrypt + verify on the way back)
 * is applied consistently everywhere and can't be accidentally
 * skipped in a new endpoint.
 *
 * BASE URLS (confirmed):
 *   Former Staff / QAA-QEEL / OAL:  https://stafftravel.qatarairways.com.qa/api/v1
 *   Active QR Staff:                https://rahal.qatarairways.com.qa/api/v1
 *
 * Selected via RAHAL_AUDIENCE env var: 'stafftravel' | 'active'
 * ─────────────────────────────────────────────────────────────────────────
 */
const { buildBasicAuthHeader, encryptPayload, decryptPayload, signPayload, verifySignature } = require('./payloadCrypto');

const BASE_URLS = {
  stafftravel: 'https://stafftravel.qatarairways.com.qa/api/v1',
  active: 'https://rahal.qatarairways.com.qa/api/v1',
};

function resolveBaseUrl() {
  const audience = process.env.RAHAL_AUDIENCE || 'stafftravel';
  const base = BASE_URLS[audience];
  if (!base) throw new Error(`Unknown RAHAL_AUDIENCE "${audience}". Must be 'stafftravel' or 'active'.`);
  return base;
}

/**
 * @param {string} path        e.g. '/flights/search' — appended to the base URL
 * @param {string} method      'GET' | 'POST' | 'PUT' | 'DELETE'
 * @param {object} [body]      plaintext request payload (will be signed + encrypted)
 * @param {object} [extraHeaders]  any additional headers (e.g. bearer token for
 *                                 an already-authenticated staff session, if RAHAL
 *                                 expects that on top of service-to-service BA)
 */
async function callRahal(path, method, body, extraHeaders = {}) {
  const url = resolveBaseUrl() + path;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': buildBasicAuthHeader(), // layer 2: BA
    ...extraHeaders,
  };

  let requestBody;
  if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
    const signature = signPayload(body);                 // layer 4 (sign plaintext first)
    const envelope = encryptPayload(body);                // layer 3 (then encrypt)
    requestBody = JSON.stringify({ ...envelope, signature });
  }

  // Layer 1 (TLS) is automatic — url uses https://, Node's fetch enforces it.
  const res = await fetch(url, { method, headers, body: requestBody });

  const rawText = await res.text();
  let parsed;
  try { parsed = JSON.parse(rawText); } catch { parsed = { raw: rawText }; }

  if (!res.ok) {
    // Error responses from RAHAL may or may not be encrypted depending on
    // their spec for error paths — confirm with IT. Returning as-is here;
    // adjust once that's confirmed.
    const err = new Error(`RAHAL backend returned ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }

  // Expecting the same envelope shape back: { encryptedKey, iv, authTag,
  // ciphertext, signature }. Confirm exact field names with IT's API spec
  // once available — this assumes symmetry with our outbound format.
  if (parsed.ciphertext && parsed.signature) {
    const { signature, ...envelope } = parsed;
    const decrypted = decryptPayload(envelope);           // reverse of layer 3
    const signatureValid = verifySignature(decrypted, signature); // reverse of layer 4
    if (!signatureValid) {
      throw new Error('RAHAL response signature verification failed — possible tampering or wrong signing key configured. Rejecting response.');
    }
    return decrypted;
  }

  // Unencrypted response (e.g. a health-check endpoint) — pass through.
  return parsed;
}

module.exports = { callRahal };
