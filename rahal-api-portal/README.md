# RAHAL – Qatar Airways Staff Travel System
## Interactive REST API Portal

> **Internal Use Only — Qatar Airways Technical Officials**
> Version 2.6 · Next.js 14 · OpenAPI 3.1

---

## Production Authentication & Provisioning Architecture

This app now includes a **real** (not simulated) provisioning + auth
security layer under `lib/security/` and `pages/api/admin/`,
`pages/api/auth/activate.js`, `pages/api/auth/token/`. It replaces
password-checking-against-a-hardcoded-object with bcrypt + RS256 JWTs +
revocable refresh tokens. Read this section before deploying for real use.

### The pre-registration problem this solves

The public login form only ever *authenticates* — it should never be able
to *create* an account. Staff accounts must exist, in `PENDING_ACTIVATION`
status with **no password set**, before anyone can log in. That's what
provisioning does.

### End-to-end flow

```
┌─────────────┐     1. POST /api/admin/staff/provision      ┌──────────────┐
│  HRIS / IT   │ ───(x-internal-api-key header)────────────▶ │  This app    │
│  admin tool  │                                              │  (auth svc)  │
└─────────────┘ ◀──── { activationLink } ────────────────────└──────────────┘
                                                                       │
                       2. HRIS emails activationLink to staff's       │
                          HR-verified corporate email (out of band)   │
                                                                       ▼
┌─────────────┐     3. POST /api/auth/activate               ┌──────────────┐
│    Staff     │ ───(token + DOB + passport + new password)─▶│  This app    │
│    member    │ ◀──── account now ACTIVE ────────────────────└──────────────┘
└─────────────┘
       │
       │  4. POST /api/auth/login/qr-staff-v2  (staffNumber + password + CAPTCHA)
       │  5. POST /api/auth/otp/send            (OTP to verified mobile/email)
       │  6. POST /api/auth/otp/verify-v2       (OTP + CAPTCHA)
       ▼
   { accessToken (RS256 JWT, 15 min), refreshToken (opaque, 7 days) }
       │
       │  7. POST /api/auth/token/refresh   — silently renew access token
       │  8. POST /api/auth/token/revoke    — logout, revokes refresh token
       ▼
   Protected endpoints via  Authorization: Bearer <accessToken>
```

### Provisioning endpoint — how it's authorized

`POST /api/admin/staff/provision` requires a header:
```
x-internal-api-key: <INTERNAL_PROVISIONING_API_KEY>
```
This key belongs to your **HRIS integration or internal admin tool** —
never the public frontend, never given to staff. See
`lib/security/adminAuth.js` for the full trust-boundary rationale and
production hardening notes (mTLS, network isolation, audit logging).

Example call:
```bash
curl -X POST https://your-deployment/api/admin/staff/provision \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: $INTERNAL_PROVISIONING_API_KEY" \
  -d '{
    "staffNumber": "778899",
    "staffType": "FORMER_STAFF",
    "firstName": "Layla",
    "lastName": "Hassan",
    "email": "layla.hassan@qatarairways.com.qa",
    "mobile": "+97455512345",
    "dateOfBirth": "1990-04-12",
    "passportNumber": "P99988877",
    "createdBy": "hris-sync-service"
  }'
```
Response includes `activationLink` — your integration is responsible for
delivering that to the staff member via a verified channel (never return
it to an unauthenticated caller in a real deployment).

### Confirmed base URLs

```
Former Staff / QAA-QEEL / OAL:  https://stafftravel.qatarairways.com.qa/api/v1
Active QR Staff:                https://rahal.qatarairways.com.qa/api/v1
```
Set via `RAHAL_AUDIENCE=stafftravel` or `RAHAL_AUDIENCE=active` in env.

### IT's stated security requirement — 4 layers on every backend call

> "Request payloads need to be signed and encrypted, in addition to BA
> and Transport Layer Security (TLS). You also need to decrypt and then
> validate the signatures of any responses that access the payload."

Implemented in `lib/security/payloadCrypto.js` + `lib/rahalClient.js`:

| Layer | What | Where |
|---|---|---|
| 1. TLS | `https://` URLs, enforced by Node's `fetch` | automatic |
| 2. BA | `Authorization: Basic base64(clientId:clientSecret)` | `buildBasicAuthHeader()` |
| 3. Encryption | Hybrid AES-256-GCM (payload) + RSA-OAEP (key wrap) | `encryptPayload()` / `decryptPayload()` |
| 4. Signing | RSA-SHA256 over canonicalized plaintext | `signPayload()` / `verifySignature()` |

**`lib/rahalClient.js`** is the single chokepoint for all real-backend
calls — every route should go through `callRahal(path, method, body)`
rather than calling `fetch` directly, so this pipeline can't be
accidentally bypassed in a new endpoint. See
`pages/api/flights/search-v2-real.js` for a fully worked example of
migrating a route from the mock implementation to the real client.

**Required env vars** (see `.env.example` for full generation
instructions): `RAHAL_BA_CLIENT_ID`, `RAHAL_BA_CLIENT_SECRET`,
`RAHAL_ENCRYPTION_PUBLIC_KEY`, `CLIENT_ENCRYPTION_PRIVATE_KEY`,
`RAHAL_SIGNING_PUBLIC_KEY`, `CLIENT_SIGNING_PRIVATE_KEY`.

Two keypairs are generated **by us**, locally, and only the public
halves ever leave our environment (sent to IT during onboarding):
`client_encryption_*` and `client_signing_*`. The other two env vars
(`RAHAL_ENCRYPTION_PUBLIC_KEY`, `RAHAL_SIGNING_PUBLIC_KEY`) are keys
**IT provides to us**. Never put a private key in a request to IT or
accept one from them over email/Slack — only public keys should ever
cross that boundary.

### Publishing your public keys (safe) vs. the private key mistake to avoid

**Never paste a private key anywhere outside your own deploy
environment — not into a chat, not into a support ticket, not into a
portal form.** The only thing that should ever be shared with a
counterparty is a public key.

To publish your service's public keys for a counterparty to fetch:

```bash
# 1. Generate BOTH keypairs locally (never on a shared/AI system)
openssl genrsa -out client_signing_private.pem 2048
openssl rsa -in client_signing_private.pem -pubout -out client_signing_public.pem

openssl genrsa -out client_encryption_private.pem 2048
openssl rsa -in client_encryption_private.pem -pubout -out client_encryption_public.pem

# 2. In Render Dashboard → your service → Environment, set:
#      CLIENT_SIGNING_PRIVATE_KEY      = contents of client_signing_private.pem
#      CLIENT_SIGNING_PUBLIC_KEY       = contents of client_signing_public.pem
#      CLIENT_ENCRYPTION_PRIVATE_KEY   = contents of client_encryption_private.pem
#      CLIENT_ENCRYPTION_PUBLIC_KEY    = contents of client_encryption_public.pem
# All four are "secret" env vars in Render's dashboard by default —
# that's fine; the PUBLIC ones just also get served back out over the
# endpoint below, which is the whole point of them being public.

# 3. Delete the local .pem files after copying into Render, or store
#    them in a proper secrets manager if you need a backup — don't
#    leave private key files sitting in a project folder or repo.

# 4. Redeploy. Your public keys are now fetchable at:
#      https://qr-rahal-portal.onrender.com/api/security/public-keys
```

Give that URL to your real IT/security contact through your
organization's actual verified channel so they can fetch and pin your
public keys on their end. Ask them for the equivalent — either a
matching published endpoint on their side, or their standard signed
key-delivery process — for `RAHAL_SIGNING_PUBLIC_KEY` and
`RAHAL_ENCRYPTION_PUBLIC_KEY`.



### Open questions for IT (not yet confirmed)

The response envelope field names, the exact canonicalization method
RAHAL expects for signing, whether error responses (4xx/5xx) are also
encrypted, and the true per-endpoint request/response schemas are all
**assumed** in the current code based on our existing mock contract.
`rahalClient.js` and the worked example route both have inline `TODO`
comments flagging every assumption that needs confirming against
RAHAL's actual API spec once IT shares it.

---



See `.env.example`. At minimum for production:
- `INTERNAL_PROVISIONING_API_KEY` — generate with `openssl rand -base64 32`
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — generate with `openssl genrsa` /
  `openssl rsa -pubout` (see comments in `lib/security/jwt.js`)

**Without these set, JWT keys regenerate on every server restart** —
every previously issued token becomes invalid. Fine for local dev only.

### ⚠️ Storage is still in-memory — read before going live

`lib/security/storage.js` currently backs everything (staff accounts,
activation tokens, refresh tokens) with in-memory `Map`s. **All
provisioned accounts are lost on every redeploy or cold start.** This
was written against a small adapter interface specifically so it's a
single-file swap to a real database — the file has a suggested Postgres
schema in its header comment. Do not provision real staff accounts
against this app until that swap is done.

### What changed vs. the earlier demo version

| Old (demo) | New (production-track) |
|---|---|
| `VALID_STAFF` hardcoded object | Real accounts via `lib/security/storage.js`, created only through provisioning |
| Plaintext password comparison | `bcrypt.compare` via `lib/security/password.js` |
| Random string "JWT" stored in a Map | Real RS256-signed JWT via `lib/security/jwt.js`, independently verifiable |
| No account states | `PENDING_ACTIVATION → ACTIVE → SUSPENDED/DISABLED` |
| No lockout | 5 failed attempts → 15 min lockout |
| No rate limiting | Per-IP rate limits on login/activate/provision |
| Login could implicitly "create" behavior | Login can never create an account — only `/api/admin/staff/provision` can |

The original `pages/api/auth/login/qr-staff.js` and
`pages/api/auth/otp/verify.js` demo files are left in place for
reference/comparison but should be deleted (or the routes disabled)
before production use — use the `-v2` versions.

---



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
