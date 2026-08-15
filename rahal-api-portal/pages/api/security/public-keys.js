/**
 * GET /api/security/public-keys
 * ─────────────────────────────────────────────────────────────────────────
 * Publishes OUR public keys for a counterparty (e.g. RAHAL/QR IT) to
 * fetch during key exchange. This is the safe half of the exchange
 * described in lib/security/payloadCrypto.js:
 *
 *   - CLIENT_SIGNING_PRIVATE_KEY     — stays server-side, NEVER exposed here
 *   - CLIENT_ENCRYPTION_PRIVATE_KEY  — stays server-side, NEVER exposed here
 *   - client signing PUBLIC key      — served below
 *   - client encryption PUBLIC key   — served below
 *
 * This route deliberately reads only the *_PUBLIC env vars. There is
 * no code path here that can reach the private key env vars — this
 * isn't just a policy, it's structural: the private key variable names
 * don't even appear in this file.
 *
 * WHAT YOU STILL NEED TO DO BEFORE THIS IS MEANINGFUL:
 *   1. Generate your own keypairs locally/in your deploy environment
 *      (see .env.example for the exact openssl commands) — this route
 *      does not generate keys, it only serves whatever public keys are
 *      already configured via env vars.
 *   2. Set CLIENT_SIGNING_PUBLIC_KEY and CLIENT_ENCRYPTION_PUBLIC_KEY
 *      in Render's environment variables (Dashboard → your service →
 *      Environment). These are the PUBLIC halves — safe to set as
 *      plain env vars, safe to serve over this endpoint.
 *   3. Give your real IT/security contact this URL
 *      (https://qr-rahal-portal.onrender.com/api/security/public-keys)
 *      through your organization's actual verified channel — not by
 *      pasting keys into a chat — so they can fetch and pin your keys.
 *   4. Confirm with them the reverse: how THEIR public keys
 *      (RAHAL_SIGNING_PUBLIC_KEY, RAHAL_ENCRYPTION_PUBLIC_KEY) will be
 *      delivered to you. A similar published endpoint on their side,
 *      or a signed document through their onboarding process, is
 *      typical — a private key should never appear in that exchange
 *      from either direction.
 * ─────────────────────────────────────────────────────────────────────────
 */

function getPublicEnv(name) {
  const val = process.env[name];
  if (!val) return null;
  return val.includes('BEGIN') ? val.replace(/\\n/g, '\n') : val;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use GET' });
  }

  const signingPublicKey = getPublicEnv('CLIENT_SIGNING_PUBLIC_KEY');
  const encryptionPublicKey = getPublicEnv('CLIENT_ENCRYPTION_PUBLIC_KEY');

  if (!signingPublicKey || !encryptionPublicKey) {
    return res.status(503).json({
      code: 'KEYS_NOT_CONFIGURED',
      message: 'Public keys have not been generated/configured yet. Set CLIENT_SIGNING_PUBLIC_KEY and CLIENT_ENCRYPTION_PUBLIC_KEY as environment variables in your deployment.',
    });
  }

  // Cache-friendly but not indefinitely — allows key rotation to
  // propagate to any caller checking periodically rather than pinning
  // forever.
  res.setHeader('Cache-Control', 'public, max-age=3600');

  return res.status(200).json({
    service: 'rahal-api-portal',
    keys: {
      signing: {
        algorithm: 'RSA-SHA256',
        publicKeyPem: signingPublicKey,
        purpose: 'Verify signatures on requests sent BY this service. Used by the counterparty to authenticate our outbound payloads.',
      },
      encryption: {
        algorithm: 'RSA-OAEP (SHA-256) key-wrap, AES-256-GCM content encryption',
        publicKeyPem: encryptionPublicKey,
        purpose: 'Encrypt responses/data TO this service. Only the matching private key (held only by us, never exposed) can decrypt.',
      },
    },
    fetchedAt: new Date().toISOString(),
  });
}
