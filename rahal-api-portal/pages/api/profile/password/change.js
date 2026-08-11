import { validateToken } from '../../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'POST') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST' });
  const { currentPassword, newPassword, confirmNewPassword } = req.body || {};
  if (!currentPassword || !newPassword || !confirmNewPassword)
    return res.status(422).json({ code:'VALIDATION_ERROR', message:'All password fields are required.' });
  if (newPassword !== confirmNewPassword)
    return res.status(422).json({ code:'PASSWORD_MISMATCH', message:'New passwords do not match.' });
  if (newPassword.length < 8)
    return res.status(422).json({ code:'PASSWORD_TOO_WEAK', message:'Password must be at least 8 characters.' });
  return res.status(200).json({ message:'Password changed successfully.' });
}
