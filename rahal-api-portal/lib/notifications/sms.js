/**
 * REAL SMS DELIVERY — via Twilio REST API
 * ─────────────────────────────────────────────────────────────────────────
 * Uses Twilio's REST API directly via fetch + Basic Auth, rather than
 * pulling in the full twilio npm SDK — keeps the dependency count low
 * (this project already trimmed unused deps earlier specifically to
 * cut down its vulnerability surface; the full SDK pulls in a lot of
 * its own transitive dependencies for functionality this project
 * doesn't need beyond "send one SMS").
 *
 * REQUIRED ENV VARS (see .env.example):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * You need an actual Twilio account (twilio.com) with a verified
 * sending number to use this — same as the email module, this code
 * can't create that account for you.
 *
 * Fails loudly if not configured, same requireEnv pattern as the rest
 * of this project.
 * ─────────────────────────────────────────────────────────────────────────
 */

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var ${name}. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to enable real SMS delivery.`);
  }
  return val;
}

/**
 * Sends the OTP SMS. Throws on failure — callers should catch and
 * return a clear error to the client rather than claim success.
 */
async function sendOtpSms(toE164Number, otpCode) {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const fromNumber = requireEnv('TWILIO_FROM_NUMBER');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const body = new URLSearchParams({
    To: toE164Number,
    From: fromNumber,
    Body: `Your RAHAL verification code is ${otpCode}. It expires in 15 minutes.`,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Twilio SMS send failed (${res.status}): ${errBody.message || 'unknown error'}`);
  }

  return res.json();
}

module.exports = { sendOtpSms };
