// In-memory mock store — resets on cold start (Vercel serverless)
// In production wire up to your actual QR backend services

const store = {
  sessions: {},
  tokens: {},
  captchas: {},
  bookings: {
    "B8XYZ6": {
      pnr:"B8XYZ6", status:"CONFIRMED", createdAt:"2026-08-08T13:19:00Z",
      staffNumber:"123456", ticketType:"ID90",
      passengers:[{passengerName:"ALRASHIDI/AHMED MR",ticketNumber:"157-1234567890",fareBasisCode:"YIF90",couponStatus:"OPEN",baggageAllowance:"1PC"}],
      itinerary:{segments:[{segmentNumber:1,flightNumber:"QR007",aircraft:"B777",origin:{iataCode:"DOH",airportName:"Hamad International Airport",terminal:"D",scheduledDeparture:"2026-09-15T08:30:00+03:00"},destination:{iataCode:"LHR",airportName:"Heathrow Airport",terminal:"4",scheduledArrival:"2026-09-15T14:00:00+01:00"},duration:"PT5H30M",cabin:"ECONOMY",bookingClass:"YIF",couponStatus:"OPEN",mealCode:"HNML",seatNumber:null}]},
      fareSummary:{ticketType:"ID90",baseFare:45.00,taxes:78.50,totalAmount:123.50,currency:"QAR",fareBasisCode:"YIF90",discountPercentage:90},
      paymentSummary:{amountPaid:123.50,currency:"QAR",paymentMethod:"CREDIT_CARD",paidAt:"2026-08-08T13:19:00Z"}
    },
    "A3MNP1": {
      pnr:"A3MNP1", status:"FLOWN", createdAt:"2026-06-01T10:00:00Z",
      staffNumber:"123456", ticketType:"ID50",
      passengers:[{passengerName:"ALRASHIDI/AHMED MR",ticketNumber:"157-9876543210",fareBasisCode:"YIF50",couponStatus:"USED",baggageAllowance:"2PC"}],
      itinerary:{segments:[{segmentNumber:1,flightNumber:"QR531",aircraft:"A320",origin:{iataCode:"DOH",scheduledDeparture:"2026-07-01T06:00:00+03:00"},destination:{iataCode:"CMB",scheduledArrival:"2026-07-01T14:00:00+05:30"},cabin:"ECONOMY",bookingClass:"YIF",couponStatus:"USED",mealCode:"AVML"}]},
      fareSummary:{ticketType:"ID50",baseFare:120.00,taxes:45.00,totalAmount:165.00,currency:"QAR"},
      paymentSummary:{amountPaid:165.00,currency:"QAR",paymentMethod:"DEBIT_CARD",paidAt:"2026-06-01T10:00:00Z"}
    }
  },
  listings: {
    "LST_QR007_20260915_001": {
      listingId:"LST_QR007_20260915_001", flightNumber:"QR007", flightDate:"2026-09-15",
      origin:"DOH", destination:"LHR", priorityCode:"R2",
      standbyPosition:3, totalStandbyCount:9, seatsAvailable:5,
      status:"LISTED", updatedAt:new Date().toISOString()
    }
  },
  profiles: {
    "123456": {
      staffNumber:"123456", firstName:"Ahmed", lastName:"Al-Rashidi",
      staffType:"FORMER_STAFF", email:"ahmed@qatarairways.com.qa",
      maskedMobile:"****7890",
      passports:[{passportNumber:"P12345678",nationality:"QAT",expiryDate:"2030-01-01",issuingCountry:"QAT"}],
      immediateFamily:[{relationship:"SPOUSE",firstName:"Fatima",lastName:"Al-Rashidi",passportNumber:"P87654321",passportExpiry:"2028-06-01"}]
    }
  }
};

export function getStore() { return store; }

export function generateCaptcha() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  const token = 'cap_' + Math.random().toString(36).slice(2, 10);
  store.captchas[token] = { code, expires: Date.now() + 300000 };
  return { captchaToken: token, code };
}

export function validateCaptcha(token, code) {
  const c = store.captchas[token];
  if (!c) return false;
  if (Date.now() > c.expires) { delete store.captchas[token]; return false; }
  const valid = c.code.toLowerCase() === (code||'').toLowerCase();
  if (valid) delete store.captchas[token];
  return valid;
}

export function generateToken(payload) {
  const tok = 'jwt_' + Math.random().toString(36).slice(2, 18) + '_' + Date.now();
  store.tokens[tok] = { ...payload, issuedAt: Date.now(), expiresAt: Date.now() + 3600000 };
  return tok;
}

export function validateToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const tok = authHeader.slice(7);
  const t = store.tokens[tok];
  if (!t) return null;
  if (Date.now() > t.expiresAt) { delete store.tokens[tok]; return null; }
  return t;
}

export function generatePNR() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pnr = '';
  for (let i = 0; i < 6; i++) pnr += chars[Math.floor(Math.random() * chars.length)];
  return pnr;
}

export function generateTicketNumber() {
  return '157-' + Math.floor(1000000000 + Math.random() * 9000000000);
}
