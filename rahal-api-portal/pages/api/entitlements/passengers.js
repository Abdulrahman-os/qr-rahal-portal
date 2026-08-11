import { validateToken } from '../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'GET') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use GET' });
  return res.status(200).json({ passengers:[
    { passengerId:'PAX_001', type:'SELF', firstName:'Ahmed', lastName:'Al-Rashidi', dateOfBirth:'1985-06-15', passportNumber:'P12345678', passportExpiry:'2030-01-01' },
    { passengerId:'PAX_002', type:'SPOUSE', firstName:'Fatima', lastName:'Al-Rashidi', dateOfBirth:'1988-03-22', passportNumber:'P87654321', passportExpiry:'2028-06-01' },
    { passengerId:'PAX_003', type:'CHILD', firstName:'Omar', lastName:'Al-Rashidi', dateOfBirth:'2015-11-10', passportNumber:'P55512345', passportExpiry:'2029-11-10' }
  ]});
}
