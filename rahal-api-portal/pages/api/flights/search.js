import { validateToken } from '../../../lib/mockStore';

const FLIGHT_DB = [
  { fn:'QR007', from:'DOH', to:'LHR', dep:'08:30', arr:'14:00', dur:'PT5H30M', ac:'B777', seats:4 },
  { fn:'QR003', from:'DOH', to:'LHR', dep:'14:00', arr:'19:30', dur:'PT5H30M', ac:'A380', seats:2 },
  { fn:'QR001', from:'DOH', to:'LHR', dep:'22:00', arr:'03:30+1', dur:'PT5H30M', ac:'B787', seats:7 },
  { fn:'QR008', from:'LHR', to:'DOH', dep:'14:00', arr:'23:30', dur:'PT5H30M', ac:'B777', seats:5 },
  { fn:'QR531', from:'DOH', to:'CMB', dep:'06:00', arr:'14:00', dur:'PT6H00M', ac:'A320', seats:3 },
  { fn:'QR532', from:'CMB', to:'DOH', dep:'16:00', arr:'20:00', dur:'PT6H00M', ac:'A320', seats:6 },
  { fn:'QR037', from:'DOH', to:'CDG', dep:'07:00', arr:'12:30', dur:'PT5H30M', ac:'A380', seats:1 },
  { fn:'QR038', from:'CDG', to:'DOH', dep:'14:30', arr:'22:00', dur:'PT5H30M', ac:'A380', seats:3 },
  { fn:'QR555', from:'DOH', to:'DXB', dep:'09:00', arr:'10:20', dur:'PT1H20M', ac:'A320', seats:8 },
  { fn:'QR700', from:'DOH', to:'JFK', dep:'02:00', arr:'08:30', dur:'PT14H30M', ac:'B777', seats:2 },
];

const FARE_MAP = { ID90:{ pct:90, basis:'YIF90' }, ID50:{ pct:50, basis:'YIF50' }, ID00:{ pct:100, basis:'YIF00' }, ZED:{ pct:85, basis:'ZEDYIF' }, REBATE:{ pct:75, basis:'REBATE' } };
const BASE_FARES = { 'DOH-LHR':580, 'LHR-DOH':580, 'DOH-CMB':320, 'CMB-DOH':320, 'DOH-CDG':560, 'CDG-DOH':560, 'DOH-DXB':120, 'DOH-JFK':980 };
const TAXES = { 'DOH-LHR':78.5, 'LHR-DOH':91, 'DOH-CMB':45, 'CMB-DOH':45, 'DOH-CDG':72, 'CDG-DOH':72, 'DOH-DXB':15, 'DOH-JFK':120 };

function calcFare(from, to, ticketType) {
  const key = `${from}-${to}`;
  const base = BASE_FARES[key] || 400;
  const tax = TAXES[key] || 50;
  const ft = FARE_MAP[ticketType] || FARE_MAP.ID90;
  const baseFare = +(base * (1 - ft.pct/100)).toFixed(2);
  return { ticketType, baseFare, taxes:tax, totalAmount:+(baseFare+tax).toFixed(2), currency:'QAR', fareBasisCode:ft.basis, discountPercentage:ft.pct };
}

function buildOption(f, date, ticketType, idx) {
  const depDate = date || new Date().toISOString().slice(0,10);
  return {
    flightOptionId:`FLT_OPT_${f.fn.replace(' ','')}_${depDate.replace(/-/g,'')}_${idx}`,
    flightNumber:f.fn, operatingCarrier:'QR', origin:f.from, destination:f.to,
    departureDateTime:`${depDate}T${f.dep.replace('+1','')}:00Z`,
    arrivalDateTime:`${depDate}T${f.arr.replace('+1','')}:00Z`,
    duration:f.dur, aircraft:f.ac, cabin:'ECONOMY', bookingClass:'YIF',
    staffSeatsAvailable:f.seats, stops:0, fareSummary:calcFare(f.from,f.to,ticketType)
  };
}

export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'POST') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST' });

  const { tripType='ONE_WAY', origin, destination, departureDate, returnDate, ticketType='ID90' } = req.body || {};
  if (!origin || !destination || !departureDate)
    return res.status(422).json({ code:'VALIDATION_ERROR', message:'origin, destination and departureDate are required.' });

  const outbound = FLIGHT_DB.filter(f => f.from===origin.toUpperCase() && f.to===destination.toUpperCase());
  const outboundOptions = outbound.length
    ? outbound.map((f,i) => buildOption(f, departureDate, ticketType, i))
    : [buildOption({fn:`QR${Math.floor(100+Math.random()*900)}`,from:origin,to:destination,dep:'10:00',arr:'16:00',dur:'PT6H00M',ac:'B787',seats:3}, departureDate, ticketType, 0)];

  let returnOptions = null;
  if (tripType === 'RETURN' && returnDate) {
    const ret = FLIGHT_DB.filter(f => f.from===destination.toUpperCase() && f.to===origin.toUpperCase());
    returnOptions = ret.length
      ? ret.map((f,i) => buildOption(f, returnDate, ticketType, i))
      : [buildOption({fn:`QR${Math.floor(100+Math.random()*900)}`,from:destination,to:origin,dep:'14:00',arr:'20:00',dur:'PT6H00M',ac:'B787',seats:5}, returnDate, ticketType, 0)];
  }

  return res.status(200).json({ searchId:'srch_'+Math.random().toString(36).slice(2,10), outboundOptions, returnOptions });
}
