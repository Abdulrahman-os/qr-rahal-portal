/**
 * CLIENT-SIDE JWT VERIFICATION — browser SubtleCrypto, zero dependencies
 * ─────────────────────────────────────────────────────────────────────────
 * Runs entirely in the browser. Fetches ONLY the public JWKS
 * (/api/jwks — the same data served at /.well-known/jwks.json) and
 * uses it to verify a token's RS256 signature via the Web Crypto API.
 *
 * No private key material is ever present in this file, sent to the
 * browser, or reachable from client-side code — that's not a style
 * choice, it's the entire point of RS256: verification only ever
 * needs the public half, by design. This mirrors exactly what any
 * external service consuming these tokens would do server-side,
 * just running here for visibility/debugging inside the portal.
 * ─────────────────────────────────────────────────────────────────────────
 */

function base64UrlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(base64url) {
  const bytes = base64UrlToUint8Array(base64url);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

async function jwkToCryptoKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * Verifies a JWT string against the live JWKS. Returns a result object
 * rather than throwing, so the UI can display partial info (e.g. a
 * malformed token's decoded header) even when verification fails.
 */
export async function verifyJwtClientSide(token, jwksUrl = '/api/jwks') {
  const result = {
    wellFormed: false,
    header: null,
    payload: null,
    signatureValid: false,
    expired: null,
    issuerValid: null,
    audienceValid: null,
    errors: [],
  };

  const parts = (token || '').trim().split('.');
  if (parts.length !== 3) {
    result.errors.push('Not a well-formed JWT (expected 3 dot-separated segments).');
    return result;
  }
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = base64UrlToJson(headerB64);
    payload = base64UrlToJson(payloadB64);
  } catch (err) {
    result.errors.push('Could not decode header/payload as JSON: ' + err.message);
    return result;
  }
  result.wellFormed = true;
  result.header = header;
  result.payload = payload;

  if (header.alg !== 'RS256') {
    result.errors.push(`Unexpected algorithm "${header.alg}" — this verifier only supports RS256, and a mismatch here is itself a red flag (algorithm confusion is a known JWT attack class).`);
    return result;
  }

  // ── Fetch the public JWKS — same-origin, no auth needed, this is
  // exactly what any external verifier would do ──
  let jwks;
  try {
    const res = await fetch(jwksUrl);
    if (!res.ok) throw new Error(`JWKS fetch returned ${res.status}`);
    jwks = await res.json();
  } catch (err) {
    result.errors.push('Could not fetch JWKS: ' + err.message);
    return result;
  }

  const matchingJwk = header.kid
    ? jwks.keys.find(k => k.kid === header.kid)
    : jwks.keys[0];

  if (!matchingJwk) {
    result.errors.push(`No matching key found in JWKS for kid "${header.kid}".`);
    return result;
  }

  try {
    const cryptoKey = await jwkToCryptoKey(matchingJwk);
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlToUint8Array(sigB64);
    result.signatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes,
      signingInput
    );
  } catch (err) {
    result.errors.push('Signature verification error: ' + err.message);
    return result;
  }

  if (!result.signatureValid) {
    result.errors.push('Signature is INVALID — token was not signed by the key in the JWKS, or has been tampered with.');
  }

  // ── Claim checks — mirrors the server-side checks in
  // lib/security/jwt.js verifyAccessToken, done here client-side for
  // visibility ──
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number') {
    result.expired = now > payload.exp;
    if (result.expired) result.errors.push(`Token expired at ${new Date(payload.exp * 1000).toISOString()}.`);
  }
  if (payload.iss !== undefined) {
    result.issuerValid = payload.iss === 'rahal-auth-service';
    if (!result.issuerValid) result.errors.push(`Unexpected issuer: "${payload.iss}".`);
  }
  if (payload.aud !== undefined) {
    result.audienceValid = payload.aud === 'rahal-api';
    if (!result.audienceValid) result.errors.push(`Unexpected audience: "${payload.aud}".`);
  }

  return result;
}
