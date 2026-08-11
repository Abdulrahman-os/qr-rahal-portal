import { validateToken, getStore } from '../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'GET') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use GET' });
  const { status='ALL', page=1, pageSize=20 } = req.query;
  const store = getStore();
  let bookings = Object.values(store.bookings).map(b => ({
    pnr:b.pnr, status:b.bookingStatus||b.status, origin:b.itinerary?.segments?.[0]?.origin?.iataCode||'DOH',
    destination:b.itinerary?.segments?.[0]?.destination?.iataCode||'LHR',
    departureDate:b.itinerary?.segments?.[0]?.origin?.scheduledDeparture?.slice(0,10)||'2026-09-15',
    ticketType:b.ticketType||'ID90', passengerCount:b.tickets?.length||1
  }));
  if (status !== 'ALL') bookings = bookings.filter(b => b.status === status || (status==='UPCOMING' && ['CONFIRMED','STANDBY'].includes(b.status)) || (status==='PAST' && ['FLOWN','REFUNDED','CANCELLED'].includes(b.status)));
  const total = bookings.length;
  const start = (Number(page)-1)*Number(pageSize);
  return res.status(200).json({ total, page:Number(page), pageSize:Number(pageSize), bookings:bookings.slice(start, start+Number(pageSize)) });
}
