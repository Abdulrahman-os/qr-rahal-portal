import { validateToken, getStore } from '../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'GET') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use GET' });
  const store = getStore();
  const profile = store.profiles[user.staffNumber] || store.profiles['123456'];
  return res.status(200).json(profile);
}
