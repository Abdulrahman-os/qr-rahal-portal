/**
 * MERGED — this file is no longer the active handler.
 *
 * The v2 real-credential logic has been promoted to qr-staff.js, which
 * is the route Next.js serves at POST /api/auth/login/qr-staff.
 *
 * This file is intentionally left as an empty stub so existing references
 * to /api/auth/login/qr-staff-v2 (e.g. in curl scripts or old docs)
 * return a clear 410 Gone rather than a silent 404.
 */
export default function handler(req, res) {
  res.status(410).json({
    code: 'ENDPOINT_MOVED',
    message: 'This v2 path has been merged into /api/auth/login/qr-staff. Update your client to use that path instead.',
    canonical: '/api/auth/login/qr-staff',
  });
}
