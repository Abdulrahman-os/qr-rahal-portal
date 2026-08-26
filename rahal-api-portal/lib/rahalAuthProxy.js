/**
 * rahalAuthProxy — credential-proxy against the RAHAL web system
 * ─────────────────────────────────────────────────────────────────────────
 * RAHAL (stafftravel.qatarairways.com.qa) is currently UI-only with no
 * formal REST API — this is confirmed in API_REQUEST_ESCALATION.md.
 *
 * This module bridges that gap by acting as a server-side browser:
 *   1. Fetches the RAHAL login page to capture the CSRF token
 *   2. POSTs the staff's credentials to RAHAL's login form endpoint
 *   3. Inspects the response to determine success/failure and extracts
 *      account fields (name, masked mobile, masked email, staffType)
 *      that RAHAL returns on successful login
 *   4. Returns a normalised result object the portal routes use
 *
 * UPGRADE PATH
 * ────────────
 * When IT delivers a formal RAHAL REST API (see IT_INTEGRATION_REQUEST.md),
 * replace the body of `authenticate()` with a single callRahal() call:
 *
 *   const { callRahal } = require('./rahalClient');
 *   const result = await callRahal('/auth/login', 'POST', { staffNumber, password, staffType });
 *   return normaliseRahalAuthResponse(result);
 *
 * Nothing outside this file needs to change because all callers go through
 * authenticate() — login route, OTP send route, and any future route that
 * needs to check account status.
 *
 * CONFIGURATION (env vars)
 * ────────────────────────
 * RAHAL_LOGIN_PAGE_URL   — Full URL of the RAHAL login page (used to
 *                          fetch the CSRF token before POST). Default:
 *                          https://stafftravel.qatarairways.com.qa/Login
 *
 * RAHAL_LOGIN_POST_URL   — The form action URL RAHAL POSTs credentials to.
 *                          Check your browser's Network tab on a real login
 *                          to confirm the exact path. Default assumes the
 *                          same page as RAHAL_LOGIN_PAGE_URL (typical for
 *                          ASP.NET MVC / Razor Pages apps).
 *
 * RAHAL_STAFF_TYPE_MAP   — JSON object mapping our staffType values to
 *                          whatever string RAHAL expects in the form body,
 *                          e.g. '{"FORMER_STAFF":"R","QAA_QEEL":"Q"}'.
 *                          Defaults documented below — verify against the
 *                          real form before going live.
 *
 * RAHAL_PROXY_TIMEOUT_MS — Per-request timeout in ms (default: 10000).
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const RAHAL_LOGIN_PAGE = process.env.RAHAL_LOGIN_PAGE_URL
  || 'https://stafftravel.qatarairways.com.qa/Login';

const RAHAL_LOGIN_POST = process.env.RAHAL_LOGIN_POST_URL
  || RAHAL_LOGIN_PAGE;

const TIMEOUT_MS = parseInt(process.env.RAHAL_PROXY_TIMEOUT_MS || '10000', 10);

// How our staffType enum maps to RAHAL's form value.
// Inspect the real form's <select> or hidden field to confirm.
const STAFF_TYPE_MAP = (() => {
  try {
    return JSON.parse(process.env.RAHAL_STAFF_TYPE_MAP || 'null') || {
      FORMER_STAFF: 'R',   // Retiree
      QAA_QEEL:    'Q',    // QAA / QEEL
    };
  } catch {
    return { FORMER_STAFF: 'R', QAA_QEEL: 'Q' };
  }
})();

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Fetch with a hard timeout.  Node 18+ has native fetch; falls back to
 * node-fetch if the global isn't available (older runtimes).
 */
function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Extract the CSRF token from a RAHAL HTML page.
 * ASP.NET emits one of these two patterns:
 *   <input name="__RequestVerificationToken" value="..." />
 *   <meta name="csrf-token" content="..." />
 * Returns null if neither is found (non-ASP.NET backend, or token not needed).
 */
function extractCsrfToken(html) {
  const inputMatch = html.match(
    /name="__RequestVerificationToken"\s+[^>]*value="([^"]+)"/
    ) || html.match(
    /value="([^"]+)"\s+[^>]*name="__RequestVerificationToken"/
  );
  if (inputMatch) return inputMatch[1];

  const metaMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
  if (metaMatch) return metaMatch[1];

  return null;
}

/**
 * Extract the Set-Cookie header from a fetch Response and return it as a
 * string suitable for sending in the Cookie header of a subsequent request.
 */
function extractCookies(response) {
  const raw = response.headers.get('set-cookie') || '';
  // Some environments surface multiple Set-Cookie as a comma-joined string
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

/**
 * Inspect RAHAL's login response HTML/JSON to decide if login succeeded
 * and to extract the fields we care about.
 *
 * THIS IS THE PART MOST LIKELY TO NEED ADJUSTMENT.
 * Check the actual RAHAL response in your browser's Network tab and update
 * the field names / response shape below to match what RAHAL really returns.
 *
 * Current heuristics (best-guess from the RAHAL login page HTML we have):
 *   - Failure: response body contains "Invalid" or stays on the login page URL
 *   - Success JSON fields (when RAHAL returns JSON on valid login):
 *       Name / FullName / StaffName
 *       PhoneNumberMasked / MaskedPhone / MaskedMobile
 *       EmailMasked / MaskedEmail
 *       StaffType / UserType / EmployeeType
 *   - Success HTML (when RAHAL returns a redirect to the dashboard):
 *       Presence of dashboard URL or absence of login error text
 */
function parseRahalLoginResponse(responseUrl, body, contentType) {
  const isJson = (contentType || '').includes('application/json');

  if (isJson) {
    let data;
    try { data = JSON.parse(body); } catch { data = {}; }

    // RAHAL returns a "success" boolean or a non-null token/session on success
    const succeeded = data.success === true
      || data.Success === true
      || Boolean(data.Token || data.token || data.SessionId || data.sessionId);

    if (!succeeded) {
      return {
        success: false,
        rahalErrorCode: data.ErrorCode || data.errorCode || data.code || 'AUTH_FAILED',
        rahalErrorMessage: data.ErrorMessage || data.errorMessage || data.message || 'Invalid credentials',
      };
    }

    return {
      success: true,
      // Normalise field names — extend this list as RAHAL's real response shape is confirmed
      name:         data.Name || data.FullName || data.StaffName || data.displayName || null,
      staffType:    data.StaffType || data.UserType || data.EmployeeType || null,
      maskedMobile: data.PhoneNumberMasked || data.MaskedPhone || data.MaskedMobile || data.maskedMobile || null,
      maskedEmail:  data.EmailMasked || data.MaskedEmail || data.maskedEmail || null,
      rahalSession: data.SessionId || data.Token || data.token || null,
    };
  }

  // HTML response — RAHAL redirected to dashboard (success) or stayed on login (failure)
  const redirectedAwayFromLogin =
    !responseUrl.includes('/Login') && !responseUrl.includes('/login');

  const hasLoginError =
    /invalid/i.test(body) ||
    /incorrect/i.test(body) ||
    /wrong.*password/i.test(body) ||
    /account.*locked/i.test(body);

  if (hasLoginError || !redirectedAwayFromLogin) {
    // Try to detect lockout specifically
    const isLocked = /account.*locked/i.test(body) || /too many.*attempt/i.test(body);
    return {
      success: false,
      rahalErrorCode: isLocked ? 'ACCOUNT_LOCKED' : 'AUTH_FAILED',
      rahalErrorMessage: isLocked
        ? 'Too many failed attempts — account locked by RAHAL'
        : 'Invalid staff number or password',
    };
  }

  // Successful HTML redirect — extract masked contact info from the page
  // RAHAL's Angular template uses {{twoFactor.PhoneNumberMasked}} — after
  // login, the real values are injected, e.g. ****7890, ****@qatarairways.com.qa
  const mobileMatch = body.match(/\*{2,4}(\d{4})/);
  const emailMatch  = body.match(/\*{2,4}(@[^\s"<]+)/);

  return {
    success: true,
    name:         null,   // Not always in the page; may need a profile API call
    staffType:    null,   // Derive from the staffType we sent
    maskedMobile: mobileMatch ? `****${mobileMatch[1]}` : null,
    maskedEmail:  emailMatch  ? `****${emailMatch[1]}`  : null,
    rahalSession: null,   // Cookie-based session is held in `sessionCookie` on the result
  };
}

// ── Public interface ──────────────────────────────────────────────────────

/**
 * Attempt to authenticate a staff member against the live RAHAL system.
 *
 * @param {string} staffNumber
 * @param {string} password
 * @param {string} staffType   'FORMER_STAFF' | 'QAA_QEEL'
 *
 * @returns {Promise<{
 *   success: boolean,
 *   // on success:
 *   name?: string|null,
 *   staffType?: string|null,
 *   maskedMobile?: string|null,
 *   maskedEmail?: string|null,
 *   sessionCookie?: string,     // Raw RAHAL session cookie — pass to subsequent calls
 *   rahalSession?: string|null, // Token/SessionId if RAHAL returned one in JSON
 *   // on failure:
 *   rahalErrorCode?: string,
 *   rahalErrorMessage?: string,
 * }>}
 */
async function authenticate(staffNumber, password, staffType = 'FORMER_STAFF') {
  // ── Step 1: Fetch the login page to capture the CSRF token ──────────────
  let csrfToken = null;
  let initialCookies = '';

  try {
    const pageRes = await fetchWithTimeout(RAHAL_LOGIN_PAGE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RAHAL-portal-proxy/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    const pageHtml = await pageRes.text();
    csrfToken = extractCsrfToken(pageHtml);
    initialCookies = extractCookies(pageRes);
  } catch (err) {
    // If we can't reach RAHAL at all, fail clearly rather than silently
    return {
      success: false,
      rahalErrorCode: 'RAHAL_UNREACHABLE',
      rahalErrorMessage: `Could not reach RAHAL login page: ${err.message}`,
    };
  }

  // ── Step 2: POST credentials ─────────────────────────────────────────────
  const rahalStaffTypeValue = STAFF_TYPE_MAP[staffType] || staffType;

  const formBody = new URLSearchParams({
    StaffNumber:    staffNumber,
    Password:       password,
    StaffType:      rahalStaffTypeValue,
    // Include CSRF token if present
    ...(csrfToken ? { __RequestVerificationToken: csrfToken } : {}),
  }).toString();

  let loginRes;
  try {
    loginRes = await fetchWithTimeout(RAHAL_LOGIN_POST, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'User-Agent':    'Mozilla/5.0 (compatible; RAHAL-portal-proxy/1.0)',
        'Accept':        'text/html,application/json,*/*',
        'Cookie':        initialCookies,
        'Referer':       RAHAL_LOGIN_PAGE,
        ...(csrfToken ? {
          'X-CSRF-Token':              csrfToken,
          'RequestVerificationToken':  csrfToken,
        } : {}),
      },
      body: formBody,
      redirect: 'follow',
    });
  } catch (err) {
    return {
      success: false,
      rahalErrorCode: 'RAHAL_UNREACHABLE',
      rahalErrorMessage: `RAHAL login POST failed: ${err.message}`,
    };
  }

  const sessionCookie = extractCookies(loginRes);
  const contentType   = loginRes.headers.get('content-type') || '';
  const responseBody  = await loginRes.text();
  const responseUrl   = loginRes.url || RAHAL_LOGIN_POST;

  // ── Step 3: Parse result ─────────────────────────────────────────────────
  const parsed = parseRahalLoginResponse(responseUrl, responseBody, contentType);

  if (!parsed.success) return parsed;

  return {
    ...parsed,
    sessionCookie,
    // Merge staffType back from our request in case RAHAL didn't return it
    staffType: parsed.staffType || staffType,
  };
}

/**
 * Use an existing RAHAL session cookie to fetch the staff member's profile.
 * Useful for getting the full name / contact info if the login response
 * didn't include it.
 *
 * Returns null if the session has expired or the profile endpoint is unknown.
 * Replace the URL below with the real RAHAL profile endpoint once confirmed.
 *
 * @param {string} sessionCookie  Raw Cookie header value from authenticate()
 */
async function fetchProfile(sessionCookie) {
  if (!sessionCookie) return null;

  // TODO: replace with the confirmed RAHAL profile endpoint path
  const RAHAL_PROFILE_URL = process.env.RAHAL_PROFILE_URL
    || 'https://stafftravel.qatarairways.com.qa/api/profile';

  try {
    const res = await fetchWithTimeout(RAHAL_PROFILE_URL, {
      headers: {
        'Cookie':     sessionCookie,
        'Accept':     'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; RAHAL-portal-proxy/1.0)',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name:         data.Name || data.FullName || data.StaffName || null,
      staffType:    data.StaffType || data.EmployeeType || null,
      maskedMobile: data.PhoneNumberMasked || data.MaskedPhone || null,
      maskedEmail:  data.EmailMasked || data.MaskedEmail || null,
    };
  } catch {
    return null;
  }
}

module.exports = { authenticate, fetchProfile };
