/**
 * REAL EMAIL DELIVERY — via SMTP (nodemailer)
 * ─────────────────────────────────────────────────────────────────────────
 * Provider-agnostic: works with Outlook/Office365, Gmail, SendGrid,
 * Amazon SES, or any SMTP-compatible service. You supply the SMTP
 * credentials for whichever provider you actually have an account
 * with — this code doesn't hardcode a vendor.
 *
 * REQUIRED ENV VARS (see .env.example):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 *
 * For Outlook/Office365 specifically: SMTP_HOST=smtp.office365.com,
 * SMTP_PORT=587, SMTP_USER=<your full email>, SMTP_PASSWORD=<an App
 * Password, not your regular login password — Outlook requires this
 * for SMTP auth if 2FA is enabled, which it should be>.
 *
 * Fails loudly (throws) if not configured, rather than silently
 * pretending to send — same requireEnv pattern used elsewhere in this
 * project (see lib/security/payloadCrypto.js) so a misconfiguration
 * surfaces immediately instead of as a mysterious "OTP never arrived."
 * ─────────────────────────────────────────────────────────────────────────
 */
const nodemailer = require('nodemailer');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var ${name}. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM to enable real email delivery.`);
  }
  return val;
}

let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: requireEnv('SMTP_HOST'),
    port: Number(requireEnv('SMTP_PORT')),
    secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false (STARTTLS) for 587/25
    auth: {
      user: requireEnv('SMTP_USER'),
      pass: requireEnv('SMTP_PASSWORD'),
    },
  });
  return cachedTransporter;
}

/**
 * Sends the OTP email. Throws on failure — callers should catch and
 * return a clear error to the client rather than claim success.
 */
async function sendOtpEmail(toEmail, otpCode) {
  const transporter = getTransporter();
  const from = requireEnv('SMTP_FROM');

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Your RAHAL verification code',
    text: `Your verification code is ${otpCode}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #5C0931;">RAHAL Staff Travel</h2>
        <p>Your verification code is:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #5C0931;">${otpCode}</p>
        <p style="color: #666; font-size: 13px;">This code expires in 15 minutes. If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
