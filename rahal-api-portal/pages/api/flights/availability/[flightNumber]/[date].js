import { validateToken } from '../../../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'GET') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use GET' });
  const { flightNumber, date } = req.query;
  if (!flightNumber || !date) return res.status(422).json({ code:'VALIDATION_ERROR', message:'flightNumber and date are required path params.' });
  const econ = Math.floor(Math.random()*20)+1;
  const biz  = Math.floor(Math.random()*5);
  const first= Math.floor(Math.random()*3);
  return res.status(200).json({
    flightNumber: flightNumber.toUpperCase(),
    date, origin:'DOH', destination:'LHR',
    operatingStatus: ['ON_TIME','ON_TIME','ON_TIME','DELAYED'][Math.floor(Math.random()*4)],
    classesByAvailability:[
      { bookingClass:'Y', cabin:'ECONOMY', totalSeats:315, availableSeats:econ, staffEligible:true },
      { bookingClass:'C', cabin:'BUSINESS', totalSeats:42, availableSeats:biz, staffEligible:true },
      { bookingClass:'F', cabin:'FIRST', totalSeats:8, availableSeats:first, staffEligible:false },
    ]
  });
}
