import { validateToken, getStore } from '../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  const { listingId } = req.query;
  const store = getStore();
  if (req.method === 'GET') {
    const l = store.listings[listingId];
    if (!l) return res.status(404).json({ code:'NOT_FOUND', message:`Listing ${listingId} not found.` });
    return res.status(200).json({ ...l, updatedAt:new Date().toISOString() });
  }
  if (req.method === 'DELETE') {
    if (!store.listings[listingId]) return res.status(404).json({ code:'NOT_FOUND', message:`Listing ${listingId} not found.` });
    delete store.listings[listingId];
    return res.status(200).json({ message:'Standby listing removed successfully.' });
  }
  return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use GET or DELETE' });
}
