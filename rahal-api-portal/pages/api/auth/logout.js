import { getStore, validateToken } from '../../../lib/mockStore';
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST' });
  const t = validateToken(req.headers.authorization);
  if (!t) return res.status(401).json({ code:'UNAUTHORIZED', message:'Invalid or expired token.' });
  const store = getStore();
  const tok = req.headers.authorization.slice(7);
  delete store.tokens[tok];
  return res.status(200).json({ message:'Logged out successfully.' });
}
