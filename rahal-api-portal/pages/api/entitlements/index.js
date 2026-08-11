import { validateToken } from '../../../lib/mockStore';
export default function handler(req, res) {
  const user = validateToken(req.headers.authorization);
  if (!user) return res.status(401).json({ code:'UNAUTHORIZED', message:'Valid Bearer token required.' });
  if (req.method !== 'GET') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use GET' });
  return res.status(200).json({
    staffNumber: user.staffNumber || '123456',
    eligibleTicketTypes: ['ID90','ID50','ZED','REBATE'],
    annualAllocation: { total:12, used:4, remaining:8 },
    eligiblePassengerCount: 3,
    travelBenefitGrade: 'GRADE_D',
    entitlementPeriod: '2026-01-01 to 2026-12-31'
  });
}
