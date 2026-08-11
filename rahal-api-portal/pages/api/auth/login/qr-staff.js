import { validateCaptcha, getStore } from '../../../../lib/mockStore';

const VALID_STAFF = {
  '123456': { password: 'P@ssword1!', type: 'FORMER_STAFF', name: 'Ahmed Al-Rashidi', mobile: '****7890', email: '****@qatarairways.com.qa' },
  '999999': { password: 'QAA@2026!', type: 'QAA_QEEL', name: 'Sara Al-Mansoori', mobile: '****1234', email: '****@qatarairways.com.qa' },
};

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { staffNumber, password, staffType, captchaToken, captchaCode } = req.body || {};

  if (!staffNumber || !password || !captchaToken || !captchaCode)
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'staffNumber, password, captchaToken and captchaCode are required.' });

  if (!validateCaptcha(captchaToken, captchaCode))
    return res.status(422).json({ code: 'CAPTCHA_INVALID', message: 'CAPTCHA code is incorrect or expired. Please refresh and try again.' });

  const staff = VALID_STAFF[staffNumber];
  if (!staff || staff.password !== password)
    return res.status(401).json({ code: 'AUTH_FAILED', message: 'Invalid staff number or password.' });

  const sessionId = 'sess_' + Math.random().toString(36).slice(2, 14);
  const store = getStore();
  store.sessions[sessionId] = { staffNumber, staffType: staff.type, name: staff.name, step: 'OTP_PENDING', createdAt: Date.now() };

  return res.status(200).json({
    pendingAuthSessionId: sessionId,
    nextStep: 'OTP_REQUIRED',
    contactHint: { maskedMobile: staff.mobile, maskedEmail: staff.email }
  });
}
