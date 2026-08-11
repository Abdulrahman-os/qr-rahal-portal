import { validateCaptcha, generateToken } from '../../../../lib/mockStore';

const VALID_OAL = {
  '157-1234567890': { lastName: 'Al-Rashidi', name: 'Ahmed Al-Rashidi', airline: 'EK' },
  '157-9876543210': { lastName: 'Smith', name: 'John Smith', airline: 'BA' },
};

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const { ticketNumber, lastName, captchaToken, captchaCode } = req.body || {};

  if (!ticketNumber || !lastName || !captchaToken || !captchaCode)
    return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'ticketNumber, lastName, captchaToken and captchaCode are required.' });

  if (!validateCaptcha(captchaToken, captchaCode))
    return res.status(422).json({ code: 'CAPTCHA_INVALID', message: 'CAPTCHA code is incorrect or expired.' });

  const staff = VALID_OAL[ticketNumber];
  if (!staff || staff.lastName.toLowerCase() !== lastName.toLowerCase())
    return res.status(401).json({ code: 'AUTH_FAILED', message: 'Invalid ticket number or last name.' });

  const token = generateToken({ staffType: 'OAL', ticketNumber, name: staff.name, airline: staff.airline });

  return res.status(200).json({
    accessToken: token,
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    staffType: 'OAL',
    displayName: staff.name,
    airline: staff.airline,
    scopedToTicket: ticketNumber
  });
}
