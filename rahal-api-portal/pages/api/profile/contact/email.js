import { validateToken, getStore } from '../../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'PUT') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use PUT' });
  const { newEmail, otpCode } = req.body || {};
  if (!newEmail || !otpCode) return res.status(422).json({ code:'VALIDATION_ERROR', message:'newEmail and otpCode are required.' });
  if (!newEmail.includes('@')) return res.status(422).json({ code:'INVALID_FORMAT', message:'Invalid email address.' });
  const store = getStore();
  const profile = store.profiles[user.staffNumber] || store.profiles['123456'];
  profile.email = newEmail;
  return res.status(200).json({ message:'Email address updated successfully.' });
}
