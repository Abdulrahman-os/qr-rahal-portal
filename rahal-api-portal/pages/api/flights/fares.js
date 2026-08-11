import { validateToken } from '../../../lib/mockStore';
const BASE_FARES = { 'DOH-LHR':580,'LHR-DOH':580,'DOH-CMB':320,'CMB-DOH':320,'DOH-CDG':560,'CDG-DOH':560,'DOH-DXB':120,'DOH-JFK':980 };
const TAXES     = { 'DOH-LHR':78.5,'LHR-DOH':91,'DOH-CMB':45,'CMB-DOH':45,'DOH-CDG':72,'CDG-DOH':72,'DOH-DXB':15,'DOH-JFK':120 };
const TYPES = ['ID90','ID50','ID00','ZED','REBATE'];
const PCT   = { ID90:90, ID50:50, ID00:100, ZED:85, REBATE:75 };
const BASIS = { ID90:'YIF90', ID50:'YIF50', ID00:'YIF00', ZED:'ZEDYIF', REBATE:'REBATE' };

export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'POST') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST' });
  const { origin, destination, ticketType } = req.body || {};
  if (!origin || !destination) return res.status(422).json({ code:'VALIDATION_ERROR', message:'origin and destination are required.' });
  const key = `${origin.toUpperCase()}-${destination.toUpperCase()}`;
  const base = BASE_FARES[key] || 400;
  const tax  = TAXES[key] || 50;
  const types = ticketType ? [ticketType] : TYPES;
  const fares = types.map(t => ({ ticketType:t, baseFare:+(base*(1-PCT[t]/100)).toFixed(2), taxes:tax, totalAmount:+(base*(1-PCT[t]/100)+tax).toFixed(2), currency:'QAR', fareBasisCode:BASIS[t], discountPercentage:PCT[t] }));
  return res.status(200).json({ origin:origin.toUpperCase(), destination:destination.toUpperCase(), fares });
}
