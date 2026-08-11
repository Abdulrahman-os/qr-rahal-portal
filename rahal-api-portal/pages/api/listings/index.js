import { validateToken, getStore } from '../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'POST') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST' });
  const { ticketNumber, flightNumber, flightDate, origin, destination, priorityCode, passengerIds } = req.body || {};
  if (!ticketNumber || !flightNumber || !flightDate || !origin || !destination || !priorityCode)
    return res.status(422).json({ code:'VALIDATION_ERROR', message:'ticketNumber, flightNumber, flightDate, origin, destination and priorityCode are required.' });
  const listingId = `LST_${flightNumber}_${flightDate.replace(/-/g,'')}_${Math.floor(Math.random()*999).toString().padStart(3,'0')}`;
  const pos = Math.floor(Math.random()*8)+1;
  const store = getStore();
  store.listings[listingId] = { listingId, flightNumber, flightDate, origin, destination, priorityCode, standbyPosition:pos, totalStandbyCount:pos+Math.floor(Math.random()*5), seatsAvailable:Math.floor(Math.random()*8)+1, status:'LISTED', updatedAt:new Date().toISOString() };
  return res.status(201).json({ listingId, standbyPosition:pos, status:'LISTED', message:`Listed on ${flightNumber} ${flightDate}. Standby position: ${pos}.` });
}
