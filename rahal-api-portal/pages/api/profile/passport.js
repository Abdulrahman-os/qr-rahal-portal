import { validateToken, getStore } from '../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'PUT') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use PUT' });
  const { passengerType, passportNumber, nationality, expiryDate, issuingCountry } = req.body || {};
  if (!passengerType || !passportNumber || !nationality || !expiryDate)
    return res.status(422).json({ code:'VALIDATION_ERROR', message:'passengerType, passportNumber, nationality and expiryDate are required.' });
  const store = getStore();
  const profile = store.profiles[user.staffNumber] || store.profiles['123456'];
  if (passengerType === 'SELF') {
    profile.passports = [{ passportNumber, nationality, expiryDate, issuingCountry: issuingCountry || nationality }];
  }
  return res.status(200).json({ message:'Passport details updated successfully.' });
}
