import { getStore, validateCaptcha, generateToken } from '../../../../lib/mockStore';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { pendingAuthSessionId, otpCode, captchaToken, captchaCode } = req.body || {};
  if (!pendingAuthSessionId || !otpCode || !captchaToken || !captchaCode)
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'pendingAuthSessionId, otpCode, captchaToken and captchaCode are required.' });

  if (!validateCaptcha(captchaToken, captchaCode))
    return res.status(422).json({ code: 'CAPTCHA_INVALID', message: 'CAPTCHA code incorrect or expired.' });

  const store = getStore();
  const session = store.sessions[pendingAuthSessionId];
  if (!session) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Session not found or expired.' });
  if (!session.otp) return res.status(400).json({ code: 'OTP_NOT_SENT', message: 'No OTP sent for this session. Call /api/auth/otp/send first.' });
  if (Date.now() > session.otpExpires) return res.status(401).json({ code: 'OTP_EXPIRED', message: 'OTP has expired. Please request a new one.' });
  if (session.otp !== otpCode) return res.status(401).json({ code: 'OTP_INVALID', message: 'Incorrect OTP code.' });

  const token = generateToken({ staffNumber: session.staffNumber, staffType: session.staffType, name: session.name });
  delete store.sessions[pendingAuthSessionId];

  return res.status(200).json({
    accessToken: token,
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    staffNumber: session.staffNumber,
    staffType: session.staffType,
    displayName: session.name
  });
}
