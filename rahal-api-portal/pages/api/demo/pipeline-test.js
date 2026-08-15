/**
 * GET /api/demo/pipeline-test
 * ─────────────────────────────────────────────────────────────────────────
 * Runs the ENTIRE sign→encrypt→send→receive→decrypt→verify pipeline
 * for real, against the local mock counterparty
 * (/api/mock-rahal-backend/flights/search), and returns a step-by-step
 * trace of what happened at each stage — so you can see the mechanism
 * actually execute rather than take it on faith from reading the code.
 *
 * This calls itself over HTTP (same deployment, different route) using
 * the exact same crypto operations lib/security/payloadCrypto.js uses
 * for the real backend — just with demo keys standing in for the real
 * CLIENT_ and RAHAL_ prefixed production keys. Swapping this from demo keys to
 * real ones later is exactly the difference between this route and
 * pages/api/flights/search-v2-real.js.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { keys, encryptFor, signWith, decryptWith, verifyWith } = require('../../../lib/security/demoCrypto');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use GET' });

  const trace = [];
  const t = (step, detail) => trace.push({ step, ...detail });

  // ── 1. Build a sample plaintext request (what a real caller would send) ──
  const requestPayload = {
    tripType: 'ONE_WAY', origin: 'DOH', destination: 'LHR',
    departureDate: '2026-09-15', ticketType: 'ID90',
  };
  t('1_plaintext_request', { payload: requestPayload });

  // ── 2. Sign the plaintext with OUR signing private key ──
  const signature = signWith(keys.ourSigning.privateKey, requestPayload);
  t('2_signed', { signaturePreview: signature.slice(0, 40) + '…', algorithm: 'RSA-SHA256' });

  // ── 3. Encrypt for the counterparty using THEIR encryption public key ──
  const envelope = encryptFor(keys.mockRahalEncryption.publicKey, requestPayload);
  t('3_encrypted', {
    algorithm: 'AES-256-GCM content + RSA-OAEP key wrap',
    ciphertextPreview: envelope.ciphertext.slice(0, 40) + '…',
    ivLength: Buffer.from(envelope.iv, 'base64').length + ' bytes',
    authTagLength: Buffer.from(envelope.authTag, 'base64').length + ' bytes',
  });

  // ── 4. Send over HTTP to the mock counterparty (real network hop, same deployment) ──
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const targetUrl = `${protocol}://${host}/api/mock-rahal-backend/flights/search`;
  t('4_sending', { url: targetUrl, method: 'POST' });

  let rawResponse;
  try {
    const httpRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...envelope, signature }),
    });
    rawResponse = await httpRes.json();
    t('4b_received_raw', { httpStatus: httpRes.status, envelopeKeys: Object.keys(rawResponse) });
  } catch (err) {
    t('4b_error', { message: err.message });
    return res.status(502).json({ code: 'DEMO_PIPELINE_FAILED', trace });
  }

  // ── 5. Decrypt the response using OUR encryption private key ──
  const { signature: responseSignature, ...responseEnvelope } = rawResponse;
  let decryptedResponse;
  try {
    decryptedResponse = decryptWith(keys.ourEncryption.privateKey, responseEnvelope);
    t('5_decrypted', { payload: decryptedResponse });
  } catch (err) {
    t('5_decryption_failed', { message: err.message });
    return res.status(502).json({ code: 'DEMO_PIPELINE_FAILED', trace });
  }

  // ── 6. Verify the response signature using the counterparty's signing public key ──
  const signatureValid = verifyWith(keys.mockRahalSigning.publicKey, decryptedResponse, responseSignature);
  t('6_signature_verified', { valid: signatureValid, algorithm: 'RSA-SHA256' });

  // ── Tamper-detection proof: verify against deliberately wrong data ──
  const tamperedCheck = verifyWith(keys.mockRahalSigning.publicKey, { ...decryptedResponse, tampered: true }, responseSignature);
  t('7_tamper_detection_proof', {
    note: 'Same signature checked against intentionally altered data — must be false',
    valid: tamperedCheck,
  });

  return res.status(200).json({
    summary: signatureValid && !tamperedCheck
      ? '✅ Full pipeline succeeded: signed, encrypted, sent, received, decrypted, and verified — and tampered data was correctly rejected.'
      : '❌ Pipeline completed but a check failed — see trace.',
    finalDecryptedPayload: decryptedResponse,
    trace,
  });
}
