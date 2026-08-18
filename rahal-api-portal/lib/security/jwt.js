/**
 * JWT SIGNING — RS256 (asymmetric)
 * ─────────────────────────────────────────────────────────────────────────
 * Why RS256 over HS256:
 *   HS256 uses ONE shared secret to both sign and verify. Any service
 *   that can verify a token can also forge one — a problem the moment
 *   you have more than one backend service checking tokens.
 *   RS256 signs with a PRIVATE key (held only by this auth service)
 *   and verifies with the matching PUBLIC key, which can be handed to
 *   every downstream service safely — they can check a token is valid
 *   but can never mint new ones.
 *
 * KEY MANAGEMENT (production):
 *   Do NOT generate keys at runtime as this file currently does for
 *   local/demo convenience. In production:
 *     1. Generate the keypair once, offline:
 *          openssl genrsa -out private.pem 2048
 *          openssl rsa -in private.pem -pubout -out public.pem
 *     2. Store private.pem in a secrets manager (AWS Secrets Manager /
 *        GCP Secret Manager / Render's encrypted env vars) — inject it
 *        via the JWT_PRIVATE_KEY env var at deploy time, never commit it.
 *     3. Rotate keys periodically; support verifying against the
 *        previous key for a grace window during rotation (JWKS `kid`
 *        header pattern) if you have multiple verifying services.
 * ─────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function loadOrGenerateKeys() {
  if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
    return {
      privateKey: process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      publicKey: process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
    };
  }
  // Dev/demo fallback ONLY — keys regenerate on every cold start, which
  // means tokens issued before a restart stop verifying. Set
  // JWT_PRIVATE_KEY / JWT_PUBLIC_KEY env vars for any real deployment.
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return { privateKey, publicKey };
}

// Cache across invocations within the same server process
const g = globalThis;
if (!g.__rahal_jwt_keys) g.__rahal_jwt_keys = loadOrGenerateKeys();
const { privateKey, publicKey } = g.__rahal_jwt_keys;

const ISSUER = 'rahal-auth-service';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;        // 15 min — short-lived, standard for access tokens
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function signAccessToken(payload) {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: 'rahal-api',
  });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'], // pin the algorithm — never trust the token's own `alg` header
      issuer: ISSUER,
      audience: 'rahal-api',
    });
  } catch (err) {
    return null;
  }
}

function getPublicKeyPem() {
  return publicKey;
}

/**
 * Converts the RS256 public key to JWK (JSON Web Key) format — the
 * industry-standard shape for /.well-known/jwks.json. This is a
 * DIFFERENT key from CLIENT_SIGNING_PUBLIC_KEY /
 * CLIENT_ENCRYPTION_PUBLIC_KEY (see lib/security/payloadCrypto.js) —
 * those are for the payload sign/encrypt scheme aimed at a real
 * backend counterparty. THIS key is what verifies the Bearer JWTs
 * this service actually issues (signAccessToken above) — that's what
 * JWKS conventionally publishes, so any service holding one of our
 * tokens can verify its signature without calling back to us.
 *
 * `kid` (key ID) is derived deterministically from the key itself
 * (not random), so it stays stable across restarts as long as the
 * same key is loaded — important once you rotate keys and need
 * multiple entries in the JWKS array, each identifiable by its kid.
 */
function getJwk() {
  const keyObject = crypto.createPublicKey(publicKey); // auto-detects PKCS1 RSA PEM
  const jwk = keyObject.export({ format: 'jwk' }); // { kty: 'RSA', n, e }
  const kid = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
  return {
    ...jwk,
    kid,
    use: 'sig',
    alg: 'RS256',
  };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  getPublicKeyPem,
  getJwk,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
};
