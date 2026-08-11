import { validateToken, getStore } from '../../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'PUT') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use PUT' });
  const { newMobileNumber, otpCode } = req.body || {};
  if (!newMobileNumber || !otpCode) return res.status(422).json({ code:'VALIDATION_ERROR', message:'newMobileNumber and otpCode are required.' });
  if (!newMobileNumber.match(/^\+[1-9]\d{7,14}$/)) return res.status(422).json({ code:'INVALID_FORMAT', message:'Mobile must be in E.164 format e.g. +97412345678' });
  const store = getStore();
  const profile = store.profiles[user.staffNumber] || store.profiles['123456'];
  profile.maskedMobile = '****' + newMobileNumber.slice(-4);
  return res.status(200).json({ message:'Mobile number updated successfully.' });
}
