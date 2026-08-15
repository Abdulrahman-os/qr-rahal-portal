export const TAGS = [
  "Authentication","CAPTCHA","Password","Profile",
  "Entitlements","Flight Search","Booking",
  "My Bookings","Listing (Standby)","Change Booking",
  "Refund","Print & Itinerary","Security Pipeline Demo"
];

export const ENDPOINTS = [
  /* ─── CAPTCHA ─── */
  {
    method:"GET", path:"/api/captcha/generate", tag:"CAPTCHA",
    summary:"Generate CAPTCHA image",
    desc:"Returns a base64 CAPTCHA image and a single-use server token. Both must be submitted with any form requiring CAPTCHA validation. Token expires in 300 s.",
    auth:false,
    params:[],
    body:null,
    example_response:{captchaToken:"cap_tok_7e8f9g",imageBase64:"data:image/png;base64,iVBORw0K...",expiresInSeconds:300}
  },
  {
    method:"GET", path:"/api/captcha/refresh", tag:"CAPTCHA",
    summary:"Refresh CAPTCHA image",
    desc:"Invalidates current token and issues a new image + token pair.",
    auth:false,
    params:[{name:"previousToken",in:"query",required:true,type:"string",desc:"Token from previous generate call"}],
    body:null,
    example_response:{captchaToken:"cap_tok_new99",imageBase64:"data:image/png;base64,iVBORw0K...",expiresInSeconds:300}
  },

  /* ─── AUTHENTICATION ─── */
  {
    method:"POST", path:"/api/auth/login/qr-staff", tag:"Authentication",
    summary:"QR Staff login (Former / QAA / QEEL)",
    desc:"Authenticates Former Staff, QAA, or QEEL using staff number + password + CAPTCHA. Returns pending session and triggers OTP or security-detail step.",
    auth:false, star:false,
    params:[],
    body:{staffNumber:"123456",password:"P@ssword1!",staffType:"FORMER_STAFF",captchaToken:"cap_abc123",captchaCode:"3fmwj"},
    fields:[
      {name:"staffNumber",type:"string",required:true,desc:"Employee staff ID"},
      {name:"password",type:"password",required:true,desc:"Account password"},
      {name:"staffType",type:"select",options:["FORMER_STAFF","QAA_QEEL"],required:true,desc:"Staff category"},
      {name:"captchaToken",type:"string",required:true,desc:"Token from /api/captcha/generate"},
      {name:"captchaCode",type:"string",required:true,desc:"Text visible in CAPTCHA image"},
    ],
    example_response:{pendingAuthSessionId:"sess_pending_abc123",nextStep:"OTP_REQUIRED",contactHint:{maskedMobile:"****7890",maskedEmail:"****@qatarairways.com.qa"}}
  },
  {
    method:"POST", path:"/api/auth/login/oal", tag:"Authentication",
    summary:"Other Airlines Staff login",
    desc:"Authenticates OAL staff using 13-digit ticket number and last name. No pre-registration needed. Session scoped to that booking.",
    auth:false,
    params:[],
    body:{ticketNumber:"157-1234567890",lastName:"Al-Rashidi",captchaToken:"cap_def456",captchaCode:"3fmwj"},
    fields:[
      {name:"ticketNumber",type:"string",required:true,desc:"13-digit ticket number (AAA-XXXXXXXXXX)"},
      {name:"lastName",type:"string",required:true,desc:"Staff member's last name"},
      {name:"captchaToken",type:"string",required:true,desc:"Token from /api/captcha/generate"},
      {name:"captchaCode",type:"string",required:true,desc:"Text visible in CAPTCHA image"},
    ],
    example_response:{accessToken:"eyJhbGciOiJSUzI1NiJ9...",tokenType:"Bearer",expiresInSeconds:3600,staffType:"OAL",displayName:"Ahmed Al-Rashidi"}
  },
  {
    method:"POST", path:"/api/auth/otp/send", tag:"Authentication",
    summary:"Send OTP to registered contact",
    desc:"Dispatches a 6-digit OTP via SMS or email. Valid for 15 minutes.",
    auth:false,
    params:[],
    body:{pendingAuthSessionId:"sess_pending_abc123",deliveryMethod:"SMS"},
    fields:[
      {name:"pendingAuthSessionId",type:"string",required:true,desc:"Session ID from login step"},
      {name:"deliveryMethod",type:"select",options:["SMS","EMAIL"],required:true,desc:"OTP delivery channel"},
    ],
    example_response:{message:"OTP sent. Valid for 15 minutes.",maskedDestination:"****7890",expiresInSeconds:900}
  },
  {
    method:"POST", path:"/api/auth/otp/verify", tag:"Authentication",
    summary:"Verify OTP and complete login",
    desc:"Submits 6-digit OTP and fresh CAPTCHA. Returns full JWT session token on success.",
    auth:false,
    params:[],
    body:{pendingAuthSessionId:"sess_pending_abc123",otpCode:"482917",captchaToken:"cap_new",captchaCode:"9xzptw"},
    fields:[
      {name:"pendingAuthSessionId",type:"string",required:true,desc:"Session ID from login step"},
      {name:"otpCode",type:"string",required:true,desc:"6-digit OTP received via SMS/email"},
      {name:"captchaToken",type:"string",required:true,desc:"Fresh CAPTCHA token"},
      {name:"captchaCode",type:"string",required:true,desc:"Fresh CAPTCHA code"},
    ],
    example_response:{accessToken:"eyJhbGciOiJSUzI1NiJ9...",tokenType:"Bearer",expiresInSeconds:3600,staffNumber:"123456",displayName:"Ahmed Al-Rashidi"}
  },
  {
    method:"POST", path:"/api/auth/security-detail/verify", tag:"Authentication",
    summary:"Security detail verification (first-time / OTP skip)",
    desc:"First-time users verify identity via DOB + Passport Number. Returns session or forced-reset token.",
    auth:false,
    params:[],
    body:{pendingAuthSessionId:"sess_pending_abc123",dateOfBirth:"1985-06-15",passportNumber:"P12345678",captchaToken:"cap_sec001",captchaCode:"4tmnvx"},
    fields:[
      {name:"pendingAuthSessionId",type:"string",required:true,desc:"Session ID from login step"},
      {name:"dateOfBirth",type:"date",required:true,desc:"Staff date of birth (YYYY-MM-DD)"},
      {name:"passportNumber",type:"string",required:true,desc:"Passport number on file"},
      {name:"captchaToken",type:"string",required:true,desc:"CAPTCHA token"},
      {name:"captchaCode",type:"string",required:true,desc:"CAPTCHA code"},
    ],
    example_response:{sessionToken:null,resetToken:"reset_tok_xyz",nextStep:"PASSWORD_CHANGE_REQUIRED"}
  },
  {
    method:"POST", path:"/api/auth/logout", tag:"Authentication",
    summary:"Logout and invalidate session",
    desc:"Invalidates the current JWT bearer token server-side.",
    auth:true, params:[], body:null, fields:[],
    example_response:{message:"Logged out successfully."}
  },

  /* ─── PASSWORD ─── */
  {
    method:"POST", path:"/api/auth/password/forgot", tag:"Password",
    summary:"Initiate forgot password flow",
    desc:"Starts password reset. Sends OTP if contact details exist; otherwise triggers security-detail form.",
    auth:false,
    params:[],
    body:{staffNumber:"123456"},
    fields:[{name:"staffNumber",type:"string",required:true,desc:"Staff ID number"}],
    example_response:{pendingAuthSessionId:"sess_reset_abc",nextStep:"OTP_REQUIRED"}
  },
  {
    method:"POST", path:"/api/auth/password/reset", tag:"Password",
    summary:"Set new password (post-verification)",
    desc:"Sets a new password after OTP or security-detail verification. Used for forgot-password and first-time forced change.",
    auth:false,
    params:[],
    body:{resetToken:"reset_tok_xyz",newPassword:"NewP@ssword1!",confirmPassword:"NewP@ssword1!"},
    fields:[
      {name:"resetToken",type:"string",required:true,desc:"Token from verification step"},
      {name:"newPassword",type:"password",required:true,desc:"New password (min 8 chars, upper+lower+digit+special)"},
      {name:"confirmPassword",type:"password",required:true,desc:"Must match newPassword"},
    ],
    example_response:{message:"Password updated. Please login with your new password."}
  },
  {
    method:"POST", path:"/api/profile/password/change", tag:"Password",
    summary:"Change password (authenticated session)",
    desc:"Change password in-session via My Profile.",
    auth:true,
    params:[],
    body:{currentPassword:"OldP@ss1!",newPassword:"NewP@ss2!",confirmNewPassword:"NewP@ss2!"},
    fields:[
      {name:"currentPassword",type:"password",required:true,desc:"Current password"},
      {name:"newPassword",type:"password",required:true,desc:"New password"},
      {name:"confirmNewPassword",type:"password",required:true,desc:"Confirm new password"},
    ],
    example_response:{message:"Password changed successfully."}
  },

  /* ─── PROFILE ─── */
  {
    method:"GET", path:"/api/profile", tag:"Profile",
    summary:"Get staff profile",
    desc:"Returns full profile: contact details, passport records, family member data.",
    auth:true, params:[], body:null, fields:[],
    example_response:{staffNumber:"123456",firstName:"Ahmed",lastName:"Al-Rashidi",staffType:"FORMER_STAFF",email:"ahmed@qatarairways.com.qa",maskedMobile:"****7890",passports:[{passportNumber:"P12345678",nationality:"QAT",expiryDate:"2030-01-01"}]}
  },
  {
    method:"PUT", path:"/api/profile/contact/mobile", tag:"Profile",
    summary:"Update mobile number",
    desc:"Updates registered mobile. Requires OTP sent to current registered email.",
    auth:true,
    params:[],
    body:{newMobileNumber:"+97412345678",otpCode:"391047"},
    fields:[
      {name:"newMobileNumber",type:"string",required:true,desc:"New mobile in E.164 format e.g. +97412345678"},
      {name:"otpCode",type:"string",required:true,desc:"OTP received on current email"},
    ],
    example_response:{message:"Mobile number updated successfully."}
  },
  {
    method:"PUT", path:"/api/profile/contact/email", tag:"Profile",
    summary:"Update email address",
    desc:"Updates registered email. Requires OTP sent to current registered mobile.",
    auth:true,
    params:[],
    body:{newEmail:"staff@example.com",otpCode:"720485"},
    fields:[
      {name:"newEmail",type:"email",required:true,desc:"New email address"},
      {name:"otpCode",type:"string",required:true,desc:"OTP received on current mobile"},
    ],
    example_response:{message:"Email address updated successfully."}
  },
  {
    method:"PUT", path:"/api/profile/passport", tag:"Profile",
    summary:"Update passport details",
    desc:"Update passport for self or immediate family (SPOUSE, CHILD, PARENT). No OTP required.",
    auth:true,
    params:[],
    body:{passengerType:"SELF",passportNumber:"P12345678",nationality:"QAT",expiryDate:"2030-01-01",issuingCountry:"QAT"},
    fields:[
      {name:"passengerType",type:"select",options:["SELF","SPOUSE","CHILD","PARENT"],required:true,desc:"Whose passport to update"},
      {name:"familyMemberId",type:"string",required:false,desc:"Required if passengerType is not SELF"},
      {name:"passportNumber",type:"string",required:true,desc:"Passport number"},
      {name:"nationality",type:"string",required:true,desc:"3-letter nationality code e.g. QAT"},
      {name:"expiryDate",type:"date",required:true,desc:"Passport expiry date"},
      {name:"issuingCountry",type:"string",required:true,desc:"3-letter issuing country code"},
    ],
    example_response:{message:"Passport details updated successfully."}
  },

  /* ─── ENTITLEMENTS ─── */
  {
    method:"GET", path:"/api/entitlements", tag:"Entitlements",
    summary:"Get staff travel entitlements",
    desc:"Returns eligible ticket types, annual allocation (used/remaining), passenger count, and travel benefit grade.",
    auth:true, params:[], body:null, fields:[],
    example_response:{staffNumber:"123456",eligibleTicketTypes:["ID90","ID50","ZED","REBATE"],annualAllocation:{total:12,used:4,remaining:8},eligiblePassengerCount:3,travelBenefitGrade:"GRADE_D"}
  },
  {
    method:"GET", path:"/api/entitlements/passengers", tag:"Entitlements",
    summary:"List eligible passengers",
    desc:"Returns self and registered dependents eligible for staff travel booking.",
    auth:true, params:[], body:null, fields:[],
    example_response:{passengers:[{passengerId:"PAX_001",type:"SELF",firstName:"Ahmed",lastName:"Al-Rashidi",passportNumber:"P12345678",passportExpiry:"2030-01-01"},{passengerId:"PAX_002",type:"SPOUSE",firstName:"Fatima",lastName:"Al-Rashidi",passportNumber:"P87654321",passportExpiry:"2028-06-01"}]}
  },

  /* ─── FLIGHT SEARCH ─── */
  {
    method:"POST", path:"/api/flights/search", tag:"Flight Search",
    summary:"Search available staff flights",
    desc:"Searches staff-eligible QR and partner flight inventory. Returns options with staff seat counts and fare breakdowns. Supports ONE_WAY, RETURN, OPEN_JAW.",
    auth:true,
    params:[],
    body:{tripType:"RETURN",origin:"DOH",destination:"LHR",departureDate:"2026-09-15",returnDate:"2026-09-30",passengers:[{passengerId:"PAX_001",type:"ADULT"}],ticketType:"ID90",airlinePreference:"QR",cabinPreference:"ANY"},
    fields:[
      {name:"tripType",type:"select",options:["ONE_WAY","RETURN","OPEN_JAW"],required:true,desc:"Trip type"},
      {name:"origin",type:"string",required:true,desc:"Origin IATA code e.g. DOH"},
      {name:"destination",type:"string",required:true,desc:"Destination IATA code e.g. LHR"},
      {name:"departureDate",type:"date",required:true,desc:"Outbound departure date"},
      {name:"returnDate",type:"date",required:false,desc:"Return date (required for RETURN)"},
      {name:"ticketType",type:"select",options:["ID90","ID50","ID00","ZED","REBATE"],required:true,desc:"Staff ticket type"},
      {name:"airlinePreference",type:"string",required:false,desc:"IATA carrier code or ANY"},
      {name:"cabinPreference",type:"select",options:["ANY","ECONOMY","BUSINESS","FIRST"],required:false,desc:"Preferred cabin"},
    ],
    example_response:{searchId:"srch_abc123",outboundOptions:[{flightOptionId:"FLT_OPT_QR007_20260915_Y",flightNumber:"QR007",origin:"DOH",destination:"LHR",departureDateTime:"2026-09-15T08:30:00Z",arrivalDateTime:"2026-09-15T14:00:00Z",duration:"PT5H30M",aircraft:"B777",cabin:"ECONOMY",bookingClass:"YIF",staffSeatsAvailable:4,fareSummary:{ticketType:"ID90",baseFare:45.00,taxes:78.50,totalAmount:123.50,currency:"QAR",fareBasisCode:"YIF90",discountPercentage:90}}],returnOptions:[{flightOptionId:"FLT_OPT_QR008_20260930_Y",flightNumber:"QR008",origin:"LHR",destination:"DOH",departureDateTime:"2026-09-30T14:00:00Z",staffSeatsAvailable:7}]}
  },
  {
    method:"GET", path:"/api/flights/availability/:flightNumber/:date", tag:"Flight Search",
    summary:"Real-time seat availability for a flight",
    desc:"Returns seat availability by class for a specific QR flight. Use before listing to gauge standby probability.",
    auth:true,
    params:[
      {name:"flightNumber",in:"path",required:true,type:"string",desc:"QR flight number e.g. QR007"},
      {name:"date",in:"path",required:true,type:"date",desc:"ISO date e.g. 2026-09-15"},
    ],
    body:null, fields:[
      {name:"flightNumber",type:"string",required:true,desc:"Flight number e.g. QR007 (path param)"},
      {name:"date",type:"date",required:true,desc:"Travel date YYYY-MM-DD (path param)"},
    ],
    example_response:{flightNumber:"QR007",date:"2026-09-15",origin:"DOH",destination:"LHR",operatingStatus:"ON_TIME",classesByAvailability:[{bookingClass:"Y",cabin:"ECONOMY",totalSeats:315,availableSeats:12,staffEligible:true},{bookingClass:"C",cabin:"BUSINESS",totalSeats:42,availableSeats:2,staffEligible:true}]}
  },
  {
    method:"POST", path:"/api/flights/fares", tag:"Flight Search",
    summary:"Check staff fares for a route",
    desc:"Returns staff fare types and amounts for a given O&D pair by ticket type and cabin.",
    auth:true,
    params:[],
    body:{origin:"DOH",destination:"CMB",ticketType:"ID50",travelDate:"2026-09-15"},
    fields:[
      {name:"origin",type:"string",required:true,desc:"Origin IATA code"},
      {name:"destination",type:"string",required:true,desc:"Destination IATA code"},
      {name:"ticketType",type:"select",options:["ID90","ID50","ID00","ZED","REBATE"],required:true,desc:"Staff ticket type"},
      {name:"travelDate",type:"date",required:false,desc:"Optional travel date for seasonal fares"},
    ],
    example_response:{origin:"DOH",destination:"CMB",fares:[{ticketType:"ID50",baseFare:120.00,taxes:45.00,totalAmount:165.00,currency:"QAR",fareBasisCode:"YIF50",discountPercentage:50},{ticketType:"ID90",baseFare:26.00,taxes:45.00,totalAmount:71.00,currency:"QAR",fareBasisCode:"YIF90",discountPercentage:90}]}
  },

  /* ─── BOOKING ─── */
  {
    method:"POST", path:"/api/bookings", tag:"Booking", star:true,
    summary:"Make booking & issue staff ticket ★",
    desc:"CORE TICKET ISSUANCE. Creates booking, generates PNR, processes payment via QR gateway, issues 13-digit e-ticket (157-XXXXXXXXXX). Ticket types: ID90 (90% off standby) · ID50 (50% off confirmed) · ID00 (duty/free) · ZED (interline) · REBATE (leisure).",
    auth:true,
    params:[],
    body:{ticketType:"ID90",passengers:[{passengerId:"PAX_001",passengerType:"ADULT"}],outboundFlightOptionId:"FLT_OPT_QR007_20260915_Y",returnFlightOptionId:null,contactInfo:{email:"staff@qatarairways.com.qa",mobileNumber:"+97412345678"},paymentMethod:"CREDIT_CARD",paymentToken:"pay_tok_abc123",fareConsent:true},
    fields:[
      {name:"ticketType",type:"select",options:["ID90","ID50","ID00","ZED","REBATE"],required:true,desc:"Staff ticket type"},
      {name:"outboundFlightOptionId",type:"string",required:true,desc:"flightOptionId from /api/flights/search"},
      {name:"returnFlightOptionId",type:"string",required:false,desc:"Return flightOptionId (for RETURN trips)"},
      {name:"paymentMethod",type:"select",options:["CREDIT_CARD","DEBIT_CARD","STAFF_ACCOUNT_DEDUCTION"],required:true,desc:"Payment method"},
      {name:"paymentToken",type:"string",required:false,desc:"Tokenized card credential from payment gateway"},
      {name:"contactEmail",type:"email",required:true,desc:"Contact email for e-ticket delivery"},
      {name:"contactMobile",type:"string",required:false,desc:"Contact mobile e.g. +97412345678"},
      {name:"fareConsent",type:"boolean",required:true,desc:"Staff must acknowledge fare and travel conditions"},
    ],
    example_response:{pnr:"B8XYZ6",bookingStatus:"STANDBY",tickets:[{ticketNumber:"157-1234567890",passengerName:"ALRASHIDI/AHMED MR",couponStatus:"OPEN"}],totalAmountCharged:123.50,currency:"QAR",issuedAt:"2026-08-08T13:19:00Z",eticketPrintUrl:"/api/bookings/B8XYZ6/eticket/print"}
  },

  /* ─── MY BOOKINGS ─── */
  {
    method:"GET", path:"/api/bookings/list", tag:"My Bookings",
    summary:"List all staff bookings",
    desc:"Paginated list of all bookings. Filter by status: UPCOMING, PAST, ALL, REFUNDED, CANCELLED.",
    auth:true,
    params:[
      {name:"status",in:"query",required:false,type:"string",desc:"UPCOMING | PAST | ALL | REFUNDED | CANCELLED"},
      {name:"page",in:"query",required:false,type:"integer",desc:"Page number (default: 1)"},
      {name:"pageSize",in:"query",required:false,type:"integer",desc:"Results per page (default: 20)"},
    ],
    body:null,
    fields:[
      {name:"status",type:"select",options:["ALL","UPCOMING","PAST","REFUNDED","CANCELLED"],required:false,desc:"Filter by booking status (query param)"},
      {name:"page",type:"number",required:false,desc:"Page number (query param)"},
      {name:"pageSize",type:"number",required:false,desc:"Results per page (query param)"},
    ],
    example_response:{total:8,page:1,pageSize:20,bookings:[{pnr:"B8XYZ6",status:"CONFIRMED",origin:"DOH",destination:"LHR",departureDate:"2026-09-15",ticketType:"ID90",passengerCount:1},{pnr:"A3MNP1",status:"FLOWN",origin:"DOH",destination:"CMB",departureDate:"2026-07-01",ticketType:"ID50",passengerCount:1}]}
  },
  {
    method:"GET", path:"/api/bookings/:pnr", tag:"My Bookings",
    summary:"Retrieve booking by PNR",
    desc:"Full booking details: passengers, itinerary, ticket numbers, coupon status, fare, and payment summary.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char alphanumeric PNR e.g. B8XYZ6"}],
    body:null,
    fields:[{name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"}],
    example_response:{pnr:"B8XYZ6",status:"CONFIRMED",createdAt:"2026-08-08T13:19:00Z",passengers:[{passengerName:"ALRASHIDI/AHMED MR",ticketNumber:"157-1234567890",fareBasisCode:"YIF90",couponStatus:"OPEN"}],itinerary:{segments:[{segmentNumber:1,flightNumber:"QR007",origin:{iataCode:"DOH",scheduledDeparture:"2026-09-15T08:30:00Z"},destination:{iataCode:"LHR",scheduledArrival:"2026-09-15T14:00:00Z"},cabin:"ECONOMY",bookingClass:"YIF",couponStatus:"OPEN",mealCode:"HNML"}]},fareSummary:{totalAmount:123.50,currency:"QAR"},paymentSummary:{amountPaid:123.50,currency:"QAR",paymentMethod:"CREDIT_CARD"}}
  },

  /* ─── LISTING ─── */
  {
    method:"POST", path:"/api/listings", tag:"Listing (Standby)",
    summary:"Add standby listing to a flight",
    desc:"Lists passengers on a flight for standby travel. Priority codes: S1 (duty confirmed) · S2 (duty standby) · R1 (rebate confirmed) · R2 (rebate standby) · N2 (OAL standby).",
    auth:true,
    params:[],
    body:{ticketNumber:"157-1234567890",flightNumber:"QR007",flightDate:"2026-09-15",origin:"DOH",destination:"LHR",priorityCode:"R2",passengerIds:["PAX_001"]},
    fields:[
      {name:"ticketNumber",type:"string",required:true,desc:"13-digit e-ticket number"},
      {name:"flightNumber",type:"string",required:true,desc:"QR flight number e.g. QR007"},
      {name:"flightDate",type:"date",required:true,desc:"Travel date YYYY-MM-DD"},
      {name:"origin",type:"string",required:true,desc:"Origin IATA code"},
      {name:"destination",type:"string",required:true,desc:"Destination IATA code"},
      {name:"priorityCode",type:"select",options:["S1","S2","R1","R2","N2"],required:true,desc:"Standby priority code"},
    ],
    example_response:{listingId:"LST_QR007_20260915_001",standbyPosition:3,status:"LISTED",message:"Listed on QR007 15-SEP-2026. Standby position: 3 of 9."}
  },
  {
    method:"GET", path:"/api/listings/:listingId", tag:"Listing (Standby)",
    summary:"Get listing status",
    desc:"Returns standby position, total count, available seats, and confirmation status.",
    auth:true,
    params:[{name:"listingId",in:"path",required:true,type:"string",desc:"Listing ID from POST /api/listings"}],
    body:null,
    fields:[{name:"listingId",type:"string",required:true,desc:"Listing ID (path param)"}],
    example_response:{listingId:"LST_QR007_20260915_001",flightNumber:"QR007",flightDate:"2026-09-15",standbyPosition:3,totalStandbyCount:9,seatsAvailable:5,status:"LISTED",updatedAt:"2026-08-08T13:30:00Z"}
  },
  {
    method:"DELETE", path:"/api/listings/:listingId", tag:"Listing (Standby)",
    summary:"Remove standby listing",
    desc:"Cancels an active standby listing.",
    auth:true,
    params:[{name:"listingId",in:"path",required:true,type:"string",desc:"Listing ID to cancel"}],
    body:null,
    fields:[{name:"listingId",type:"string",required:true,desc:"Listing ID (path param)"}],
    example_response:{message:"Standby listing removed successfully."}
  },

  /* ─── CHANGE BOOKING ─── */
  {
    method:"POST", path:"/api/bookings/:pnr/change/search", tag:"Change Booking",
    summary:"Search flights for rebooking",
    desc:"Returns staff-eligible flight options for new dates/sector. Must be called before confirming a change.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"}],
    body:{segmentToChange:"OUTBOUND",newDepartureDate:"2026-09-22"},
    fields:[
      {name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"},
      {name:"segmentToChange",type:"select",options:["OUTBOUND","INBOUND","BOTH"],required:true,desc:"Which segment to rebook"},
      {name:"newDepartureDate",type:"date",required:false,desc:"New departure date"},
      {name:"newReturnDate",type:"date",required:false,desc:"New return date"},
    ],
    example_response:{searchId:"srch_chg_456",outboundOptions:[{flightOptionId:"FLT_OPT_QR007_20260922_Y",flightNumber:"QR007",departureDateTime:"2026-09-22T08:30:00Z",staffSeatsAvailable:6,fareSummary:{totalAmount:123.50,currency:"QAR"}}]}
  },
  {
    method:"POST", path:"/api/bookings/:pnr/change", tag:"Change Booking", star:true,
    summary:"Change booking dates or sector ★",
    desc:"Modifies dates, sector, or both. Fare difference charged/refunded automatically. Steps: (1) GET /api/bookings/:pnr → (2) POST /api/bookings/:pnr/change/search → (3) POST this endpoint.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"}],
    body:{segmentToChange:"OUTBOUND",newDepartureDate:"2026-09-22",newFlightOptionId:"FLT_OPT_QR007_20260922_Y",fareConsentForDifference:true},
    fields:[
      {name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"},
      {name:"segmentToChange",type:"select",options:["OUTBOUND","INBOUND","BOTH"],required:true,desc:"Segment to change"},
      {name:"newDepartureDate",type:"date",required:false,desc:"New departure date"},
      {name:"newFlightOptionId",type:"string",required:true,desc:"flightOptionId from change/search"},
      {name:"fareConsentForDifference",type:"boolean",required:true,desc:"Acknowledge any fare difference"},
    ],
    example_response:{pnr:"B8XYZ6",changeStatus:"CHANGE_CONFIRMED",fareDifference:0.00,message:"Booking changed. New departure: 22-SEP-2026 QR007 DOH-LHR."}
  },

  /* ─── REFUND ─── */
  {
    method:"GET", path:"/api/bookings/:pnr/refund/preview", tag:"Refund",
    summary:"Preview refund amount",
    desc:"Returns refundable amount, penalties, and eligibility type (FULL_VOID / PARTIAL_REFUND / NON_REFUNDABLE) before committing.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"}],
    body:null,
    fields:[{name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"}],
    example_response:{pnr:"B8XYZ6",tickets:[{ticketNumber:"157-1234567890",sector:"DOH-LHR",refundableAmount:90.00,penaltyAmount:33.50,currency:"QAR"}],totalRefundableAmount:90.00,currency:"QAR",refundEligibility:"PARTIAL_REFUND"}
  },
  {
    method:"POST", path:"/api/bookings/:pnr/refund", tag:"Refund", star:true,
    summary:"Confirm ticket refund / void ★",
    desc:"Processes full void (same-day, pre-departure) or partial refund (post-departure / used coupon). Penalties applied per fare rules.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"}],
    body:{confirmRefund:true,ticketNumbers:["157-1234567890"],refundReason:"PERSONAL"},
    fields:[
      {name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"},
      {name:"confirmRefund",type:"boolean",required:true,desc:"Must be true to process refund"},
      {name:"refundReason",type:"select",options:["PERSONAL","SCHEDULE_CHANGE","MEDICAL","OPERATIONAL"],required:true,desc:"Reason for refund"},
    ],
    example_response:{pnr:"B8XYZ6",refundStatus:"REFUNDED",refundedTickets:["157-1234567890"],refundAmount:90.00,currency:"QAR",message:"Ticket successfully refunded.",refundedAt:"2026-08-08T14:00:00Z"}
  },

  /* ─── PRINT ─── */
  {
    method:"GET", path:"/api/bookings/:pnr/itinerary", tag:"Print & Itinerary",
    summary:"Get itinerary details (JSON)",
    desc:"Full structured itinerary: segments, passenger names, ticket numbers, fare basis codes, coupon status, meal codes, seat numbers.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"}],
    body:null,
    fields:[{name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"}],
    example_response:{pnr:"B8XYZ6",passengers:[{passengerName:"ALRASHIDI/AHMED MR",ticketNumber:"157-1234567890",ticketType:"ID90",fareBasisCode:"YIF90",baggageAllowance:"1PC"}],segments:[{segmentNumber:1,flightNumber:"QR007",aircraft:"B777",origin:{iataCode:"DOH",airportName:"Hamad International Airport",terminal:"D",scheduledDeparture:"2026-09-15T08:30:00+03:00"},destination:{iataCode:"LHR",airportName:"Heathrow Airport",terminal:"4",scheduledArrival:"2026-09-15T14:00:00+01:00"},cabin:"ECONOMY",bookingClass:"YIF",couponStatus:"OPEN",mealCode:"HNML"}]}
  },
  {
    method:"GET", path:"/api/bookings/:pnr/eticket/print", tag:"Print & Itinerary", star:true,
    summary:"Download e-ticket PDF ★",
    desc:"Returns a print-ready PDF or pre-signed URL. PDF includes: passenger name + staff ID, 13-digit e-ticket (157-XXXXXXXXXX), PNR, full itinerary, fare class + basis code, ticket type, baggage allowance, booking conditions, QR barcode for airport scanning. Send Accept: application/pdf for binary or Accept: application/json for URL.",
    auth:true,
    params:[
      {name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"},
      {name:"passengerTicketNumber",in:"query",required:false,type:"string",desc:"Filter to specific ticket e.g. 157-1234567890"},
    ],
    body:null,
    fields:[
      {name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"},
      {name:"passengerTicketNumber",type:"string",required:false,desc:"Optional: specific ticket number (query param)"},
    ],
    example_response:{downloadUrl:"https://stafftravel.qatarairways.com.qa/api/v1/files/eticket_QR_B8XYZ6.pdf",expiresAt:"2026-09-15T14:30:00Z",fileSizeKb:245,contentType:"application/pdf"}
  },
  {
    method:"GET", path:"/api/bookings/:pnr/itinerary/print", tag:"Print & Itinerary",
    summary:"Download itinerary receipt PDF",
    desc:"Returns a 1-page printer-friendly itinerary receipt for trip planning and airport presentation.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"}],
    body:null,
    fields:[{name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"}],
    example_response:{downloadUrl:"https://stafftravel.qatarairways.com.qa/api/v1/files/itinerary_QR_B8XYZ6.pdf",expiresAt:"2026-09-15T14:30:00Z",fileSizeKb:78}
  },
  {
    method:"POST", path:"/api/bookings/:pnr/eticket/resend", tag:"Print & Itinerary",
    summary:"Resend e-ticket to email",
    desc:"Sends the e-ticket confirmation email to the registered address or an override.",
    auth:true,
    params:[{name:"pnr",in:"path",required:true,type:"string",desc:"6-char PNR"}],
    body:{emailOverride:"alt@example.com"},
    fields:[
      {name:"pnr",type:"string",required:true,desc:"6-char PNR (path param)"},
      {name:"emailOverride",type:"email",required:false,desc:"Optional alternative email"},
    ],
    example_response:{message:"E-ticket resent to alt@example.com.",sentAt:"2026-08-08T14:05:00Z"}
  },

  /* ─── REAL-BACKEND-SHAPED TEMPLATE — not wired to real QR systems ─── */
  {
    method:"POST", path:"/api/flights/search-v2-real", tag:"Flight Search", backend:"real-shaped",
    summary:"Flight search (real-backend-shaped template, inactive)",
    desc:"NOT connected to any real Qatar Airways system. This is a template showing how a route would call the real RAHAL backend via lib/rahalClient.js once IT provides real credentials and API documentation — currently calling it will fail with missing-credential errors, by design (see lib/security/payloadCrypto.js requireEnv). Not linked from any other part of this UI's normal flow.",
    auth:true, params:[], body:{tripType:"ONE_WAY",origin:"DOH",destination:"LHR",departureDate:"2026-09-15",ticketType:"ID90"}, fields:[],
    example_response:{code:"RAHAL_BACKEND_UNREACHABLE", message:"Missing required env var RAHAL_BA_CLIENT_ID — not yet configured."}
  },

  /* ─── SECURITY PIPELINE DEMO — self-contained, never touches a real backend ─── */
  {
    method:"GET", path:"/api/demo/pipeline-test", tag:"Security Pipeline Demo", backend:"demo-pipeline",
    summary:"Run full sign→encrypt→send→decrypt→verify pipeline ★",
    desc:"Executes the ENTIRE payload security pipeline for real against a local mock counterparty (never a real QR system): signs a sample request, encrypts it, sends it over HTTP to /api/mock-rahal-backend/flights/search, receives a real signed+encrypted response, decrypts it, verifies the signature, and proves tamper-detection works. Returns a full step-by-step trace so you can see every stage execute rather than take it on faith.",
    auth:false, params:[], body:null, fields:[],
    example_response:{summary:"✅ Full pipeline succeeded...", finalDecryptedPayload:{searchId:"srch_demo_abc123", outboundOptions:[{flightNumber:"QR007"}]}, trace:[{step:"1_plaintext_request"},{step:"2_signed"},{step:"3_encrypted"},{step:"4_sending"},{step:"5_decrypted"},{step:"6_signature_verified",valid:true},{step:"7_tamper_detection_proof",valid:false}]}
  },
  {
    method:"POST", path:"/api/mock-rahal-backend/flights/search", tag:"Security Pipeline Demo", backend:"mock-counterparty",
    summary:"Mock RAHAL counterparty (local only, not a real backend)",
    desc:"Plays the RAHAL side of the exchange entirely within this deployment. Decrypts an incoming signed+encrypted envelope, verifies the sender's signature, and returns its own signed+encrypted response. Called by the pipeline-test route above — not meant to be hit directly, but callable to inspect the envelope format.",
    auth:false, params:[], body:{encryptedKey:"<base64>", iv:"<base64>", authTag:"<base64>", ciphertext:"<base64>", signature:"<base64>"}, fields:[],
    example_response:{encryptedKey:"<base64>", iv:"<base64>", authTag:"<base64>", ciphertext:"<base64>", signature:"<base64>"}
  },
];
