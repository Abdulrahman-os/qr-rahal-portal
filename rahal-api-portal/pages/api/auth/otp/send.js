import { getStore } from '../../../../lib/mockStore';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { pendingAuthSessionId, deliveryMethod } = req.body || {};
  if (!pendingAuthSessionId || !deliveryMethod)
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'pendingAuthSessionId and deliveryMethod are required.' });

  const store = getStore();
  const session = store.sessions[pendingAuthSessionId];
  if (!session) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Session not found or expired. Please login again.' });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  session.otp = otp;
  session.otpExpires = Date.now() + 900000;
  session.otpDelivery = deliveryMethod;

  const masked = deliveryMethod === 'SMS' ? '****7890' : '****@qatarairways.com.qa';

  return res.status(200).json({
    message: `OTP sent via ${deliveryMethod}. Valid for 15 minutes.`,
    maskedDestination: masked,
    expiresInSeconds: 900,
    _dev_otp: process.env.NODE_ENV !== 'production' ? otp : undefined
  });
}
