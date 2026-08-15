To: itsc@qatarairways.com.qa
Subject: Backend Integration Request — RAHAL Staff Travel Portal (Replace Interim Mock Layer with Production PSS/DCS Connection)

---

Dear IT Service Center Team,

I am requesting technical onboarding to connect an internal staff-travel
tooling project to the official RAHAL backend services (PSS / DCS /
revenue management) currently serving stafftravel.qatarairways.com.qa
and rahal.qatarairways.com.qa.

The application currently runs against a self-contained interim data
layer (in-memory mock store, used only for interface development and
internal review) and needs to be pointed at real backend services
before any production use. I've attached a technical requirements
summary below covering exactly what we need from your side to make
that swap safely.

Could you advise on:

  1. The correct internal team/process for requesting API credentials
     to the RAHAL backend (PSS, DCS, fare/ticketing, refund services)
  2. Whether a formal system integration request / change ticket is
     required, and where that's filed
  3. Any existing internal API gateway, service mesh, or B2B
     integration layer we should be authenticating against rather than
     calling backend services directly
  4. Required security review / architecture review steps for a new
     service consuming these backends
  5. Point of contact for the identity/HRIS team, since our
     provisioning flow needs to consume the same staff-eligibility
     data source RAHAL uses today (rather than maintaining a separate
     shadow list of staff numbers)

Happy to walk through the current architecture on a call if that's
easier than email. Technical summary attached below.

Thank you,
[Your name]
[Your role / team]
[Internal contact info]

---

═══════════════════════════════════════════════════════════════════════
TECHNICAL REQUIREMENTS SUMMARY — Backend Swap
═══════════════════════════════════════════════════════════════════════

CURRENT STATE
─────────────
The application (Next.js) implements the RAHAL API surface (auth,
flight search, booking/ticketing, listing, refund, print) against an
interim in-memory store for interface and workflow validation. All
data resets on process restart; no production data or real PNRs/
tickets are involved.

Repository structure (for reference):
  pages/api/auth/          — login, OTP, activation, token refresh
  pages/api/flights/       — search, availability, fares
  pages/api/bookings/      — create, list, retrieve, change, refund, print
  pages/api/listings/      — standby listing CRUD
  lib/security/storage.js  — data-access layer (currently in-memory Maps)
  lib/security/jwt.js      — RS256 JWT issuance for session tokens

WHAT NEEDS TO CHANGE
─────────────────────
Only the data-access layer needs to be swapped — the HTTP route
signatures and request/response shapes were built to mirror RAHAL's
existing UI workflows, so the swap should be additive rather than a
rewrite, provided the real backend's contracts match what's outlined
below. Please confirm/correct.

1. STAFF IDENTITY / ENTITLEMENT SOURCE
   - What system is authoritative for staff numbers, employment
     status (active/former/QAA/QEEL), and travel entitlement grade?
     (e.g. SAP SuccessFactors, an internal HRIS feed, or a RAHAL-owned
     staff master table)
   - Is there an existing API/feed we should read from, or does
     provisioning need to go through a specific HR-triggered event?
   - Confirm whether staff identity verification during first login
     (DOB + passport match) should validate against this same source.

2. AUTHENTICATION / SSO
   - Does QR have an existing internal SSO/IdP (e.g. Azure AD, Okta)
     that staff-facing tools should federate against, rather than us
     maintaining independent password storage?
   - If RAHAL's own auth service is the system of record for staff
     credentials, what's the integration pattern — direct API, or do
     we sit behind an API gateway?

3. FLIGHT SEARCH / AVAILABILITY
   - PSS system in use (Amadeus Altéa, Sabre, or in-house) and the
     correct API/NDC endpoint for staff-fare availability queries
   - How staff-eligible seat inventory is distinguished from general
     sale inventory in the response
   - Rate limits / quota on search calls

4. BOOKING / TICKET ISSUANCE
   - PNR creation and e-ticketing endpoint(s) — same PSS as above or a
     separate ticketing service
   - Payment gateway used for staff-fare payment collection, and
     whether we integrate directly or via a hosted payment page/token
     handoff
   - Required fields/format for staff ticket types (ID90/ID50/ID00/
     ZED/REBATE) — confirming our fare-type enum matches RAHAL's
     internal codes

5. STANDBY LISTING
   - System of record for standby lists (DCS, or a RAHAL-specific
     listing service) and priority-code mapping (S1/S2/R1/R2/N2 as
     used in the current UI)

6. REFUND / VOID
   - Refund/void endpoint and business rules for penalty calculation
     (currently stubbed in our layer — needs the real fare-rule engine)

7. E-TICKET / ITINERARY DOCUMENT GENERATION
   - Whether PDF e-ticket generation is a service we call, or content
     we're expected to render ourselves from itinerary data (and if
     so, the required layout/branding template)

8. ENVIRONMENTS
   - Availability of a UAT/sandbox environment for these services
     before any production credential is issued
   - Expected process for promoting from UAT to production access

9. SECURITY / COMPLIANCE
   - Required architecture/security review process for a new
     consumer of these backend services
   - Any data classification or PCI-DSS scope considerations given
     payment handling
   - Network access requirements (VPN, IP allowlisting, mTLS) for
     reaching internal backend endpoints from our hosting environment

CURRENT INTERIM SECURITY MEASURES (for context on our side)
─────────────────────────────────────────────────────────────
While awaiting backend access, the app already implements
production-grade patterns on the application layer so the swap is
lower-risk:
  - bcrypt password hashing, RS256-signed JWTs, revocable refresh
    tokens, rate limiting, account lockout
  - Admin-gated provisioning endpoint (separate credential from staff
    login, not exposed to the public frontend)
  - Storage layer abstracted behind a single adapter interface
    specifically so backend/database swaps don't require touching
    route handlers

Happy to share the full source or a technical walkthrough on request.

═══════════════════════════════════════════════════════════════════════
