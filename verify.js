import { getStore, validateCaptcha, generateToken } from '../../../../lib/mockStore';

const VALID_SECURITY = {
  '123456': { dateOfBirth: '1985-06-15', passportNumber: 'P12345678' }
};

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  const { pendingAuthSessionId, dateOfBirth, passportNumber, captchaToken, captchaCode } = req.body || {};
  if (!pendingAuthSessionId || !dateOfBirth || !passportNumber || !captchaToken || !captchaCode)
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'All fields required.' });
  if (!validateCaptcha(captchaToken, captchaCode))
    return res.status(422).json({ code: 'CAPTCHA_INVALID', message: 'CAPTCHA incorrect or expired.' });

  const store = getStore();
  const session = store.sessions[pendingAuthSessionId];
  if (!session) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Session not found or expired.' });

  const secData = VALID_SECURITY[session.staffNumber];
  if (!secData || secData.dateOfBirth !== dateOfBirth || secData.passportNumber !== passportNumber)
    return res.status(401).json({ code: 'SECURITY_DETAIL_MISMATCH', message: 'Date of birth or passport number does not match our records.' });

  const resetToken = 'reset_' + Math.random().toString(36).slice(2, 12);
  store.sessions[resetToken] = { staffNumber: session.staffNumber, type: 'PASSWORD_RESET' };
  delete store.sessions[pendingAuthSessionId];

  return res.status(200).json({ sessionToken: null, resetToken, nextStep: 'PASSWORD_CHANGE_REQUIRED' });
}
