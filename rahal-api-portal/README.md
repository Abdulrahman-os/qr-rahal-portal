# RAHAL – Qatar Airways Staff Travel System
## Interactive REST API Portal

> **Internal Use Only — Qatar Airways Technical Officials**
> Version 2.6 · Next.js 14 · OpenAPI 3.1

---

## Quick Deploy to Render (recommended alternative)

### Method A — Render Dashboard + GitHub (no CLI, ~3 min)

1. Push this project to a **private GitHub repo**:
   ```bash
   git init
   git add .
   git commit -m "RAHAL API Portal v2.6"
   git remote add origin https://github.com/YOUR_ORG/rahal-api-portal.git
   git push -u origin main
   ```
2. Go to **https://dashboard.render.com/select-repo?type=web**
3. Connect the repo. Render auto-detects `render.yaml` in this project and
   pre-fills everything:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Plan:** Free (or Starter for no cold-starts)
4. Click **Create Web Service**. Render builds and deploys automatically.
5. You'll get a URL like `https://rahal-api-portal.onrender.com`

### Method B — Render Blueprint (one-click via render.yaml)

This repo already includes `render.yaml`. In the Render dashboard:
1. **New → Blueprint**
2. Point it at your GitHub repo — Render reads `render.yaml` and provisions
   the service with zero manual config.

### Method C — Render CLI

```bash
npm i -g @render/cli   # if available in your org, else use the dashboard
render deploy
```

> **Note on the free plan:** Render's free web services spin down after 15
> minutes of inactivity and take ~30–50s to cold-start on the next request.
> Since this app uses an **in-memory mock store**, a cold start also resets
> all bookings/sessions/tokens created during testing. For persistent state
> in production, wire `lib/mockStore.js` to Redis (Render offers managed
> Redis) or a real database, and upgrade to the Starter plan to avoid
> spin-down entirely.

---

## Quick Deploy to Vercel (alternative — serverless, no cold-start resets to worry about differently)

### Method A — Vercel CLI (recommended, ~2 min)

```bash
# 1. Install Vercel CLI globally
npm i -g vercel

# 2. Enter project directory
cd rahal-api-portal

# 3. Install dependencies
npm install

# 4. Deploy
vercel --prod
```

Follow the prompts (link to your team/project). Done.

---

### Method B — GitHub + Vercel Dashboard (zero CLI)

1. Create a **private** GitHub repository: `rahal-api-portal`
2. Push this folder:
   ```bash
   git init
   git add .
   git commit -m "RAHAL API Portal v2.6"
   git remote add origin https://github.com/YOUR_ORG/rahal-api-portal.git
   git push -u origin main
   ```
3. Go to **https://vercel.com/new**
4. Import the GitHub repo → Framework: **Next.js** → Deploy
5. Done — Vercel assigns a URL like `rahal-api-portal.vercel.app`

---

### Method C — Vercel CLI drag-and-drop (no Git)

```bash
npm i -g vercel
cd rahal-api-portal
npm install
vercel deploy --prod
```

---

## Local Development

```bash
npm install
npm run dev
# → http://localhost:3000
```

In dev mode the API returns `_dev_code` (CAPTCHA) and `_dev_otp` (OTP) in
responses so you can complete the auth flow without real SMS/email.

---

## Live Test Credentials

| Field         | Value               |
|---------------|---------------------|
| Staff Number  | `123456`            |
| Password      | `P@ssword1!`        |
| Staff Type    | `FORMER_STAFF`      |
| OAL Ticket    | `157-1234567890`    |
| OAL Last Name | `Al-Rashidi`        |
| Test PNR      | `B8XYZ6`            |

---

## Full Auth Flow (Step-by-Step)

```
1. GET  /api/captcha/generate        → { captchaToken, imageBase64, _dev_code }
2. POST /api/auth/login/qr-staff     → { pendingAuthSessionId }
3. POST /api/auth/otp/send           → { _dev_otp }
4. GET  /api/captcha/refresh         → fresh token for OTP verify step
5. POST /api/auth/otp/verify         → { accessToken }   ← use as Bearer token
6. POST /api/flights/search          → { outboundOptions[].flightOptionId }
7. POST /api/bookings                → { pnr, tickets[].ticketNumber }
8. GET  /api/bookings/{pnr}/eticket/print → { downloadUrl }
```

---

## API Endpoints (33 total)

### CAPTCHA
| Method | Path | Auth |
|--------|------|------|
| GET | /api/captcha/generate | No |
| GET | /api/captcha/refresh | No |

### Authentication
| Method | Path | Auth |
|--------|------|------|
| POST | /api/auth/login/qr-staff | No |
| POST | /api/auth/login/oal | No |
| POST | /api/auth/otp/send | No |
| POST | /api/auth/otp/verify | No |
| POST | /api/auth/security-detail/verify | No |
| POST | /api/auth/logout | Bearer |

### Password
| Method | Path | Auth |
|--------|------|------|
| POST | /api/auth/password/forgot | No |
| POST | /api/auth/password/reset | No |
| POST | /api/profile/password/change | Bearer |

### Profile
| Method | Path | Auth |
|--------|------|------|
| GET | /api/profile | Bearer |
| PUT | /api/profile/contact/mobile | Bearer |
| PUT | /api/profile/contact/email | Bearer |
| PUT | /api/profile/passport | Bearer |

### Entitlements
| Method | Path | Auth |
|--------|------|------|
| GET | /api/entitlements | Bearer |
| GET | /api/entitlements/passengers | Bearer |

### Flight Search
| Method | Path | Auth |
|--------|------|------|
| POST | /api/flights/search | Bearer |
| GET | /api/flights/availability/:flightNumber/:date | Bearer |
| POST | /api/flights/fares | Bearer |

### Booking ★
| Method | Path | Auth |
|--------|------|------|
| POST | /api/bookings | Bearer |
| GET | /api/bookings/list | Bearer |
| GET | /api/bookings/:pnr | Bearer |

### Listing (Standby)
| Method | Path | Auth |
|--------|------|------|
| POST | /api/listings | Bearer |
| GET | /api/listings/:listingId | Bearer |
| DELETE | /api/listings/:listingId | Bearer |

### Change Booking ★
| Method | Path | Auth |
|--------|------|------|
| POST | /api/bookings/:pnr/change/search | Bearer |
| POST | /api/bookings/:pnr/change | Bearer |

### Refund ★
| Method | Path | Auth |
|--------|------|------|
| GET | /api/bookings/:pnr/refund/preview | Bearer |
| POST | /api/bookings/:pnr/refund | Bearer |

### Print & Itinerary ★
| Method | Path | Auth |
|--------|------|------|
| GET | /api/bookings/:pnr/itinerary | Bearer |
| GET | /api/bookings/:pnr/eticket/print | Bearer |
| GET | /api/bookings/:pnr/itinerary/print | Bearer |
| POST | /api/bookings/:pnr/eticket/resend | Bearer |

---

## Architecture

```
rahal-api-portal/
├── pages/
│   ├── index.js              ← Interactive portal UI (React)
│   ├── _app.js
│   └── api/
│       ├── captcha/          ← CAPTCHA generate + refresh
│       ├── auth/             ← login, OTP, security-detail, logout, password
│       ├── profile/          ← profile, contact, passport
│       ├── entitlements/     ← entitlements + eligible passengers
│       ├── flights/          ← search, availability, fares
│       ├── bookings/         ← create, list, PNR routes, change, refund, print
│       └── listings/         ← standby listing CRUD
├── lib/
│   ├── endpoints.js          ← Endpoint registry (UI data)
│   └── mockStore.js          ← In-memory data store + auth utilities
├── styles/
│   └── globals.css
├── vercel.json
└── package.json
```

---

## Connecting to Real QR Backend

Replace the mock handlers in `pages/api/` with real HTTP calls to the
QR backend systems (PSS, DCS, revenue management) using `axios` or `fetch`.
Update `lib/mockStore.js` to point at a real session store (Redis recommended).

---

© 2022–2026 Qatar Airways. All Rights Reserved. Confidential — Internal Use Only.
