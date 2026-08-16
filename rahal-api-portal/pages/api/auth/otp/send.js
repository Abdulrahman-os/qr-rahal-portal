/**
 * POST /api/auth/otp/send  (v2 — real delivery, no demo fallback)
 * ─────────────────────────────────────────────────────────────────────────
 * Sends a real OTP via actual email (SMTP) or SMS (Twilio) — see
 * lib/notifications/email.js and lib/notifications/sms.js. The
 * previous `_dev_otp` field (which returned the code directly in the
 * API response for testing) has been removed entirely.
 *
 * IMPORTANT: real delivery requires a REAL destination address, which
 * means this only works for accounts created through the actual
 * provisioning flow (POST /api/admin/staff/provision → stores a real
 * email/mobile → POST /api/auth/activate), NOT the original hardcoded
 * demo account (staffNumber 123456 from login/qr-staff.js's
 * VALID_STAFF object) — that account has no real contact info
 * anywhere, just fake display strings like "****7890". If you're
 * still using that demo account, this route will correctly fail with
 * NO_CONTACT_INFO rather than pretend to send somewhere fictional.
 *
 * To actually test real delivery end-to-end:
 *   1. POST /api/admin/staff/provision with YOUR real email/mobile
 *      (requires x-internal-api-key — see lib/security/adminAuth.js)
 *   2. POST /api/auth/activate using the returned activation token
 *   3. POST /api/auth/login/qr-staff-v2 with the staffNumber you chose
 *   4. THIS route now sends a real OTP to your real email/mobile
 * ─────────────────────────────────────────────────────────────────────────
 */
const { getStore } = require('../../../../lib/mockStore');
const storage = require('../../../../lib/security/storage');
const { sendOtpEmail } = require('../../../../lib/notifications/email');
const { sendOtpSms } = require('../../../../lib/notifications/sms');
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
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { pendingAuthSessionId, deliveryMethod } = req.body || {};
  if (!pendingAuthSessionId || !deliveryMethod)
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'pendingAuthSessionId and deliveryMethod are required.' });
  if (!['SMS', 'EMAIL'].includes(deliveryMethod))
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'deliveryMethod must be SMS or EMAIL.' });

  const mockStore = getStore();
  const session = mockStore.sessions[pendingAuthSessionId];
  if (!session) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Session not found or expired. Please login again.' });

  // ── Look up the REAL account for a real destination address ──
  const account = await storage.getStaffAccount(session.staffNumber);
  const destination = deliveryMethod === 'EMAIL' ? account?.email : account?.mobile;

  if (!destination) {
    return res.status(422).json({
      code: 'NO_CONTACT_INFO',
      message: `No real ${deliveryMethod.toLowerCase()} on file for this account, so a real OTP cannot be sent. This account may be the legacy demo account (staffNumber 123456) rather than a provisioned real account — see this route's file header comment for how to provision one with real contact info.`,
    });
  }

  const otp = generateNumericOtp(6);
  session.otp = otp;
  session.otpExpires = Date.now() + 900000;
  session.otpDelivery = deliveryMethod;

  try {
    if (deliveryMethod === 'EMAIL') {
      await sendOtpEmail(destination, otp);
    } else {
      await sendOtpSms(destination, otp);
    }
  } catch (err) {
    // Real delivery failed — do NOT fall back to returning the code in
    // the response. Surface the failure clearly instead.
    console.error('OTP delivery failed:', err.message);
    return res.status(502).json({
      code: 'OTP_DELIVERY_FAILED',
      message: `Could not send OTP via ${deliveryMethod}: ${err.message}`,
    });
  }

  const masked = deliveryMethod === 'EMAIL' ? maskEmail(destination) : maskMobile(destination);

  return res.status(200).json({
    message: `OTP sent via ${deliveryMethod}. Valid for 15 minutes.`,
    maskedDestination: masked,
    expiresInSeconds: 900,
  });
}
