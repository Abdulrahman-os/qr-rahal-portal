import { getStore } from '../../../../lib/mockStore';
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST' });
  const { resetToken, newPassword, confirmPassword } = req.body || {};
  if (!resetToken || !newPassword || !confirmPassword)
    return res.status(422).json({ code:'VALIDATION_ERROR', message:'resetToken, newPassword and confirmPassword are required.' });
  if (newPassword !== confirmPassword)
    return res.status(422).json({ code:'PASSWORD_MISMATCH', message:'Passwords do not match.' });
  if (newPassword.length < 8)
    return res.status(422).json({ code:'PASSWORD_TOO_WEAK', message:'Password must be at least 8 characters with uppercase, lowercase, digit and special character.' });
  const store = getStore();
  const sess = store.sessions[resetToken];
  if (!sess) return res.status(401).json({ code:'TOKEN_INVALID', message:'Reset token is invalid or expired.' });
  delete store.sessions[resetToken];
  return res.status(200).json({ message:'Password updated successfully. Please login with your new password.' });
}
