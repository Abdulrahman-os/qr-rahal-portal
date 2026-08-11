import { getStore } from '../../../../lib/mockStore';
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use POST' });
  const { staffNumber } = req.body || {};
  if (!staffNumber) return res.status(422).json({ code:'VALIDATION_ERROR', message:'staffNumber is required.' });
  const sessId = 'sess_reset_' + Math.random().toString(36).slice(2, 10);
  const store = getStore();
  store.sessions[sessId] = { staffNumber, step:'RESET', createdAt:Date.now() };
  return res.status(200).json({ pendingAuthSessionId:sessId, nextStep:'OTP_REQUIRED', message:'If a staff account exists, OTP has been dispatched.' });
}
