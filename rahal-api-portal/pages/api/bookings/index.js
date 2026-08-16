/**
 * POST /api/bookings  (v2 — real JWT + scope enforcement)
 * ─────────────────────────────────────────────────────────────────────────
 * BREAKING CHANGE from the original version of this file: authentication
 * now goes through requireAuth (real RS256 JWT) instead of the old
 * mockStore.validateToken. This means tokens issued by the ORIGINAL
 * demo login flow (login/qr-staff.js → otp/verify.js) are no longer
 * accepted here — only tokens from the v2 flow (login/qr-staff-v2.js →
 * otp/verify-v2.js) or OAL login work. This is intentional: booking
 * creation is real money movement and belongs on the real auth system,
 * not the mock one, now that role/scope enforcement exists to protect it.
 *
 * Requires the BOOKINGS_WRITE scope specifically — OAL tokens (which
 * only get bookings:read, see lib/security/roles.js) are correctly
 * rejected here with 403, not 401: they authenticated fine, they just
 * don't have permission to create bookings.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { getStore, generatePNR, generateTicketNumber } from '../../../lib/mockStore';
const { requireAuth, hasScope } = require('../../../lib/security/requireAuth');
const { SCOPES } = require('../../../lib/security/roles');

export default function handler(req, res) {
  const user = requireAuth(req);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (!hasScope(user, SCOPES.BOOKINGS_WRITE)) {
    return res.status(403).json({ code:'FORBIDDEN', message:`Missing required scope: ${SCOPES.BOOKINGS_WRITE}` });
  }

  if (req.method === 'POST') {
    const { ticketType, passengers, outboundFlightOptionId, returnFlightOptionId, contactInfo, paymentMethod, fareConsent } = req.body || {};
    if (!ticketType || !outboundFlightOptionId || !fareConsent)
      return res.status(422).json({ code:'VALIDATION_ERROR', message:'ticketType, outboundFlightOptionId and fareConsent are required.' });
    if (!paymentMethod)
      return res.status(422).json({ code:'VALIDATION_ERROR', message:'paymentMethod is required.' });

    const pnr = generatePNR();
    const paxList = passengers || [{ passengerId:'PAX_001', passengerType:'ADULT' }];
    const tickets = paxList.map((p, i) => ({
      ticketNumber: generateTicketNumber(),
      passengerName: i===0 ? 'ALRASHIDI/AHMED MR' : 'ALRASHIDI/FATIMA MRS',
      passengerType: p.passengerType || 'ADULT',
      couponStatus: 'OPEN'
    }));

    const FARE_MAP = { ID90:{ base:45, tax:78.5 }, ID50:{ base:120, tax:45 }, ID00:{ base:0, tax:0 }, ZED:{ base:60, tax:78.5 }, REBATE:{ base:80, tax:45 } };
    const fare = FARE_MAP[ticketType] || FARE_MAP.ID90;
    const total = +((fare.base + fare.tax) * paxList.length).toFixed(2);

    const booking = {
      pnr, bookingStatus: ticketType === 'ID90' ? 'STANDBY' : 'CONFIRMED',
      staffNumber: user.sub,
      ticketType, tickets,
      totalAmountCharged: total, currency:'QAR',
      issuedAt: new Date().toISOString(),
      contactInfo: contactInfo || {},
      paymentMethod,
      outboundFlightOptionId,
      returnFlightOptionId: returnFlightOptionId || null,
      itinerary: { segments:[{ segmentNumber:1, flightNumber:'QR007', aircraft:'B777', origin:{ iataCode:'DOH', airportName:'Hamad International Airport', terminal:'D', scheduledDeparture:'2026-09-15T08:30:00+03:00' }, destination:{ iataCode:'LHR', airportName:'Heathrow Airport', terminal:'4', scheduledArrival:'2026-09-15T14:00:00+01:00' }, cabin:'ECONOMY', bookingClass:'YIF', couponStatus:'OPEN', mealCode:'HNML', seatNumber:null }] },
      fareSummary:{ ticketType, baseFare:fare.base, taxes:fare.tax, totalAmount:+(fare.base+fare.tax).toFixed(2), currency:'QAR' }
    };

    const store = getStore();
    store.bookings[pnr] = booking;

    return res.status(201).json({ pnr, bookingStatus:booking.bookingStatus, tickets, totalAmountCharged:total, currency:'QAR', issuedAt:booking.issuedAt, eticketPrintUrl:`/api/bookings/${pnr}/eticket/print` });
  }

  return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST to create a booking.' });
}
