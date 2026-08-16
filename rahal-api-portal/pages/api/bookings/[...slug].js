/**
 * Dynamic /api/bookings/:pnr/* catch-all — v2 real JWT + scope
 * enforcement.
 *
 * BREAKING CHANGE from the original: top-level auth now uses
 * requireAuth (real RS256 JWT) instead of mockStore.validateToken.
 * Tokens from the ORIGINAL demo login flow no longer work on ANY
 * action in this file — only v2-flow or OAL tokens do.
 *
 * Scope gates applied per-action (not just one blanket check for the
 * whole file): read-only actions (itinerary, print, refund preview,
 * change search) only require being authenticated at all; the two
 * actions that actually move money or change a real ticket — refund
 * and change — additionally require REFUND_WRITE / BOOKINGS_WRITE
 * respectively. An OAL token (bookings:read only, no write scopes)
 * can view a booking but is correctly rejected with 403 if it tries
 * to refund or change one.
 */
import { getStore, generateTicketNumber } from '../../../lib/mockStore';
const { requireAuth, hasScope, matchesTicketScope } = require('../../../lib/security/requireAuth');
const { SCOPES } = require('../../../lib/security/roles');

export default function handler(req, res) {
  const user = requireAuth(req);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });

  const { slug } = req.query;
  const pnr = slug[0]?.toUpperCase();
  const action = slug.slice(1).join('/');
  const store = getStore();

  // OAL tokens are scoped to ONE ticket at login time — reject outright
  // if they're trying to touch a different PNR than the one they
  // authenticated with, regardless of which action. Staff tokens have
  // no scopedToTicket claim, so this is a no-op for them.
  if (!matchesTicketScope(user, pnr)) {
    return res.status(403).json({ code:'FORBIDDEN', message:'This token is not authorized for this booking.' });
  }

  // ─── GET /api/bookings/:pnr ───
  if (!action && req.method === 'GET') {
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    return res.status(200).json(b);
  }

  // ─── GET /api/bookings/:pnr/itinerary ───
  if (action === 'itinerary' && req.method === 'GET') {
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    return res.status(200).json({
      pnr,
      passengers: (b.tickets||[]).map((t,i)=>({ passengerName:t.passengerName, ticketNumber:t.ticketNumber, ticketType:b.ticketType, fareBasisCode:b.fareSummary?.fareBasisCode||'YIF90', baggageAllowance:i===0?'1PC':'1PC' })),
      segments: b.itinerary?.segments || [],
      totalJourneyDuration:'PT5H30M'
    });
  }

  // ─── GET /api/bookings/:pnr/eticket/print ───
  if (action === 'eticket/print' && req.method === 'GET') {
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    const accept = req.headers.accept || '';
    if (accept.includes('application/pdf')) {
      const fakePdf = `%PDF-1.4\n%RAHAL E-TICKET\nPNR: ${pnr}\nIssued: ${new Date().toISOString()}\n`;
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="eticket_QR_${pnr}.pdf"`);
      return res.status(200).send(Buffer.from(fakePdf));
    }
    return res.status(200).json({
      downloadUrl:`https://stafftravel.qatarairways.com.qa/api/v1/files/eticket_QR_${pnr}_${Date.now()}.pdf`,
      expiresAt: new Date(Date.now()+3600000).toISOString(),
      fileSizeKb:245, contentType:'application/pdf',
      eticketData:{
        pnr, passengers:b.tickets||[], itinerary:b.itinerary,
        ticketType:b.ticketType, fareBasisCode:b.fareSummary?.fareBasisCode,
        issuedAt:b.issuedAt, baggageAllowance:'1PC'
      }
    });
  }

  // ─── GET /api/bookings/:pnr/itinerary/print ───
  if (action === 'itinerary/print' && req.method === 'GET') {
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    return res.status(200).json({ downloadUrl:`https://stafftravel.qatarairways.com.qa/api/v1/files/itinerary_QR_${pnr}.pdf`, expiresAt:new Date(Date.now()+3600000).toISOString(), fileSizeKb:78 });
  }

  // ─── POST /api/bookings/:pnr/eticket/resend ───
  if (action === 'eticket/resend' && req.method === 'POST') {
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    const email = req.body?.emailOverride || b.contactInfo?.email || 'staff@qatarairways.com.qa';
    return res.status(200).json({ message:`E-ticket resent to ${email}.`, sentAt:new Date().toISOString() });
  }

  // ─── GET /api/bookings/:pnr/refund/preview ───
  if (action === 'refund/preview' && req.method === 'GET') {
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    const base = b.fareSummary?.baseFare || 45;
    const tax  = b.fareSummary?.taxes || 78.5;
    const penalty = +(base*0.25).toFixed(2);
    const refundable = +(base - penalty + tax).toFixed(2);
    return res.status(200).json({
      pnr,
      tickets:(b.tickets||[]).map(t=>({ ticketNumber:t.ticketNumber, couponStatus:t.couponStatus, sector:'DOH-LHR', refundableAmount:refundable, penaltyAmount:penalty, currency:'QAR' })),
      totalRefundableAmount: refundable, currency:'QAR',
      refundEligibility: b.bookingStatus === 'FLOWN' ? 'NON_REFUNDABLE' : 'PARTIAL_REFUND'
    });
  }

  // ─── POST /api/bookings/:pnr/refund ───
  if (action === 'refund' && req.method === 'POST') {
    if (!hasScope(user, SCOPES.REFUND_WRITE)) {
      return res.status(403).json({ code:'FORBIDDEN', message:`Missing required scope: ${SCOPES.REFUND_WRITE}` });
    }
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    if (b.bookingStatus === 'REFUNDED') return res.status(409).json({ code:'ALREADY_REFUNDED', message:'This booking has already been refunded.' });
    if (b.bookingStatus === 'FLOWN') return res.status(409).json({ code:'NOT_ELIGIBLE', message:'Flown tickets are non-refundable.' });
    const { confirmRefund } = req.body || {};
    if (!confirmRefund) return res.status(422).json({ code:'VALIDATION_ERROR', message:'confirmRefund must be true.' });
    const base = b.fareSummary?.baseFare || 45;
    const penalty = +(base*0.25).toFixed(2);
    const refundAmount = +(base - penalty + (b.fareSummary?.taxes||78.5)).toFixed(2);
    b.bookingStatus = 'REFUNDED';
    (b.tickets||[]).forEach(t => t.couponStatus = 'REFUNDED');
    return res.status(200).json({
      pnr, refundStatus:'REFUNDED',
      refundedTickets:(b.tickets||[]).map(t=>t.ticketNumber),
      refundAmount, currency:'QAR',
      message:'Ticket successfully refunded. Amount will be credited within 5-7 business days.',
      refundedAt:new Date().toISOString()
    });
  }

  // ─── POST /api/bookings/:pnr/change/search ───
  if (action === 'change/search' && req.method === 'POST') {
    const { segmentToChange='OUTBOUND', newDepartureDate } = req.body || {};
    const date = newDepartureDate || new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    return res.status(200).json({
      searchId:'srch_chg_'+Math.random().toString(36).slice(2,10),
      outboundOptions:[
        { flightOptionId:`FLT_OPT_QR007_${date.replace(/-/g,'')}_CHG`, flightNumber:'QR007', origin:'DOH', destination:'LHR', departureDateTime:`${date}T08:30:00Z`, arrivalDateTime:`${date}T14:00:00Z`, staffSeatsAvailable:6, fareSummary:{ totalAmount:123.50, currency:'QAR' } },
        { flightOptionId:`FLT_OPT_QR001_${date.replace(/-/g,'')}_CHG`, flightNumber:'QR001', origin:'DOH', destination:'LHR', departureDateTime:`${date}T22:00:00Z`, arrivalDateTime:`${date}T03:30:00Z`, staffSeatsAvailable:3, fareSummary:{ totalAmount:123.50, currency:'QAR' } }
      ]
    });
  }

  // ─── POST /api/bookings/:pnr/change ───
  if (action === 'change' && req.method === 'POST') {
    if (!hasScope(user, SCOPES.BOOKINGS_WRITE)) {
      return res.status(403).json({ code:'FORBIDDEN', message:`Missing required scope: ${SCOPES.BOOKINGS_WRITE}` });
    }
    const b = store.bookings[pnr];
    if (!b) return res.status(404).json({ code:'NOT_FOUND', message:`Booking ${pnr} not found.` });
    const { newFlightOptionId, fareConsentForDifference } = req.body || {};
    if (!newFlightOptionId) return res.status(422).json({ code:'VALIDATION_ERROR', message:'newFlightOptionId is required.' });
    if (!fareConsentForDifference) return res.status(422).json({ code:'VALIDATION_ERROR', message:'fareConsentForDifference must be true.' });
    const newDate = newFlightOptionId.match(/(\d{8})/)?.[1];
    const fmt = newDate ? `${newDate.slice(0,4)}-${newDate.slice(4,6)}-${newDate.slice(6,8)}` : 'new date';
    return res.status(200).json({ pnr, changeStatus:'CHANGE_CONFIRMED', fareDifference:0.00, newFlightOptionId, message:`Booking changed. New flight: ${fmt}.`, changedAt:new Date().toISOString() });
  }

  return res.status(404).json({ code:'NOT_FOUND', message:`Route /api/bookings/${slug.join('/')} not found.` });
}
