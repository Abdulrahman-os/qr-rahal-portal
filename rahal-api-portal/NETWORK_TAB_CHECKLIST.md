# RAHAL Network Tab Checklist

Reference: RAHAL QAA/QEEL Staff User Guide v1.0

Open Chrome DevTools → Network → XHR/Fetch filter, then perform each
action on https://stafftravel.qatarairways.com.qa and record what you find.
Update the corresponding env vars or source code locations noted below.

---

## 1. Login (§2.1)

**Action:** Click QR Staff → QAA/QEEL Staff, fill Staff Number + Password +
Captcha, click Log In.

**Find the POST request and record:**

| What to capture | Where to use it |
|---|---|
| Request URL (e.g. `/api/Account/Login`) | `RAHAL_LOGIN_API_URL` in `.env.local` |
| Request body field names (staffNumber? StaffId? password? Password?) | `rahalAuthProxy.js` → `const payload = { ... }` |
| `staffType` field value for QAA/QEEL (e.g. `"QAAQEEL"`, `"Q"`, `2`) | `RAHAL_STAFF_TYPE_MAP` in `.env.local` |
| `staffType` field value for Former Staff | same map |
| Response body on **success** — all field names (especially masked contact) | `rahalAuthProxy.js` → `parseJsonResponse()` |
| Response body on **failure** — `ErrorCode` or `code` field value | `rahalAuthProxy.js` → `mapRahalErrorCode()` |
| Auth cookie name set in `Set-Cookie` (e.g. `.AspNetCore.Session`) | no code change needed — cookies forwarded automatically |
| `XSRF-TOKEN` cookie present? | `rahalAuthProxy.js` → `extractCsrfToken()` already handles it |

**Expected success response fields (confirmed from OTP screen in guide):**
```json
{
  "PhoneNumberMasked": "****4321",
  "EmailMasked": "****mlt.qatarairways.com.qa"
}
```
Plus any of: `Name`, `FullName`, `StaffType`, `Token`, `SessionId`.

---

## 2. OTP Send (§2.2)

**Action:** On the OTP screen, select SMS or Email, click Send OTP.

| What to capture | Where to use it |
|---|---|
| Request URL (e.g. `/api/Account/SendOtp`) | `pages/api/auth/otp/send.js` → RAHAL OTP proxy path |
| Request body (session token? delivery method field name?) | same file |
| Whether RAHAL sends the OTP itself or just returns the contact address | determines if we need Twilio/SMTP at all |

---

## 3. OTP Verify (§2.2)

**Action:** Enter OTP code, click Continue.

| What to capture | Where to use it |
|---|---|
| Request URL (e.g. `/api/Account/VerifyOtp`) | `pages/api/auth/otp/verify.js` |
| Request body field names | same file |
| Response on success (new token? redirect?) | same file |

---

## 4. Security Detail (§2.3 — first-time / forgot-password only)

**Action:** Enter Date of Birth + Passport Number, click Submit.

| What to capture | Where to use it |
|---|---|
| Request URL | `pages/api/auth/security-detail/verify.js` |
| Field names for DOB and passport | same file |
| Response on success (token for password change?) | same file |

---

## 5. Change Password (§2.3)

**Action:** Enter new password + confirm, click Submit.

| What to capture | Where to use it |
|---|---|
| Request URL | `pages/api/auth/change-password.js` |
| Field names (newPassword? confirmPassword?) | same file |

---

## 6. Profile (for unmasked contact info)

**Action:** While logged in, look for any automatic background requests that
fetch the user's profile or dashboard data.

| What to capture | Where to use it |
|---|---|
| Request URL returning name + full email/mobile | `RAHAL_PROFILE_URL` in `.env.local` |
| Field names in the response | `rahalAuthProxy.js` → `fetchProfile()` |

---

## Quick reference — env vars to fill after checklist

```env
RAHAL_LOGIN_API_URL=https://stafftravel.qatarairways.com.qa/<confirmed-path>
RAHAL_PROFILE_URL=https://stafftravel.qatarairways.com.qa/<confirmed-path>
RAHAL_STAFF_TYPE_MAP={"FORMER_STAFF":"<confirmed>","QAA_QEEL":"<confirmed>"}
```
