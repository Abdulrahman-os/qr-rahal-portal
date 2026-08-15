/**
 * RATE LIMITING
 * ─────────────────────────────────────────────────────────────────────────
 * This in-memory limiter works within a single server process. On
 * serverless platforms (Vercel) or multi-instance deployments (Render
 * with >1 instance), each instance has its own counter — so this only
 * approximately rate-limits. For real production traffic, back this
 * with Redis (INCR + EXPIRE, or a sliding-window library) shared across
 * all instances, or use your platform's edge rate limiting
 * (e.g. Vercel Firewall, Cloudflare) in front of these routes.
 * ─────────────────────────────────────────────────────────────────────────
 */
const buckets = new Map(); // key -> { count, resetAt }

function checkRateLimit(key, { limit = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { checkRateLimit, getClientIp };
