/**
 * POST /api/auth/otp/send
 * ─────────────────────────────────────────────────────────────────────────
 * Sends a 6-digit OTP to the staff member's real mobile or email.
 *
 * Contact info (masked mobile / real email for delivery) comes from the
 * RAHAL login response — it was stored on the portal session when the
 * staff authenticated via POST /api/auth/login/qr-staff. No local DB
 * lookup is needed; RAHAL is the source of truth for contact details.
 *
 * OTP delivery is handled by our own Twilio / SMTP layer so we control
 * the delivery pipeline independently of RAHAL. When RAHAL gains an
 * API and exposes its own OTP endpoint, this route can optionally
 * proxy through that instead — see the TODO comment below.
 * ─────────────────────────────────────────────────────────────────────────
 */

const { getStore } = require('../../../../lib/mockStore');
const { sendOtpEmail } = require('../../../../lib/notifications/email');
const { sendOtpSms }   = require('../../../../lib/notifications/sms');
const { generateNumericOtp } = require('../../../../lib/security/tokens');

function maskEmail(email) {
  const at = email.indexOf('@');
  if (at < 1) return '****';
  return '****' + email.slice(at);
}

function maskMobile(mobile) {
  return '****' + mobile.slice(-4);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  }

  const { pendingAuthSessionId, deliveryMethod } = req.body || {};

  if (!pendingAuthSessionId || !deliveryMethod) {
    return res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: 'pendingAuthSessionId and deliveryMethod are required.',
    });
  }
  if (!['SMS', 'EMAIL'].includes(deliveryMethod)) {
    return res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: 'deliveryMethod must be SMS or EMAIL.',
    });
  }

  const store = getStore();
  const session = store.sessions[pendingAuthSessionId];

  if (!session) {
    return res.status(401).json({
      code: 'SESSION_INVALID',
      message: 'Session not found or expired. Please login again.',
    });
  }

  // ── Contact info comes from the RAHAL login response, held on the session ──
  // The session was populated by POST /api/auth/login/qr-staff which stored
  // maskedMobile and maskedEmail directly from RAHAL's reply.
  //
  // For OTP delivery we need the REAL (unmasked) destination — RAHAL's login
  // response typically returns both the masked display and, for email, the
  // full address (or at least enough to deliver).
  //
  // TODO: If RAHAL only returns masked values, use RAHAL's own OTP endpoint:
  //   await callRahal('/auth/otp/send', 'POST', {
  //     rahalSession: session.rahalSession,
  //     deliveryMethod,
  //   });
  // and skip the Twilio/SMTP call below.  Until RAHAL has an API, we rely on
  // the full contact being stored on the session by the login proxy.

  const destination = deliveryMethod === 'EMAIL'
    ? session.contactEmail   // full email set by proxy if available
    : session.contactMobile; // full mobile set by proxy if available

  // Masked values for the response display
  const maskedDisplay = deliveryMethod === 'EMAIL'
    ? (session.maskedEmail  || (destination ? maskEmail(destination)  : null))
    : (session.maskedMobile || (destination ? maskMobile(destination) : null));

  if (!destination) {
    return res.status(422).json({
      code: 'NO_CONTACT_INFO',
      message: `No ${deliveryMethod.toLowerCase()} address on file for this session. `
        + 'RAHAL may not have returned contact details on login — '
        + 'check rahalAuthProxy.js parseRahalLoginResponse() to confirm the field names match.',
    });
  }

  // ── Generate and store OTP ────────────────────────────────────────────────
  const otp = generateNumericOtp(6);
  session.otp            = otp;
  session.otpExpires     = Date.now() + 900_000; // 15 minutes
  session.otpDelivery    = deliveryMethod;

  // ── Deliver OTP ───────────────────────────────────────────────────────────
  try {
    if (deliveryMethod === 'EMAIL') {
      await sendOtpEmail(destination, otp);
    } else {
      await sendOtpSms(destination, otp);
    }
  } catch (err) {
    console.error('[otp/send] Delivery failed:', err.message);
    return res.status(502).json({
      code: 'OTP_DELIVERY_FAILED',
      message: `Could not send OTP via ${deliveryMethod}: ${err.message}`,
    });
  }

  return res.status(200).json({
    message: `OTP sent via ${deliveryMethod}. Valid for 15 minutes.`,
    maskedDestination: maskedDisplay,
    expiresInSeconds: 900,
  });
}
