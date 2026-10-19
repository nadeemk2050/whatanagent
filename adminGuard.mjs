// Fail-closed admin middleware.
//
// The legacy adminOk() in index.js returns TRUE when ADMIN_TOKEN is unset, which leaves the
// secret endpoints open. New routes must not behave that way: if the token is not configured
// the endpoint refuses to serve (503) instead of silently allowing anyone through.
//
// Hardening that does not depend on how strong the token is:
//   • constant-time comparison (no timing leak),
//   • brute-force lockout per client IP after repeated failures.
import crypto from 'crypto';

const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();          // ip -> { count, first, until }

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

function lockedFor(ip) {
  const rec = attempts.get(ip);
  if (!rec) return 0;
  const now = Date.now();
  if (rec.until && rec.until > now) return rec.until - now;
  if (rec.until && rec.until <= now) { attempts.delete(ip); return 0; }
  if (rec.first && (now - rec.first) > WINDOW_MS) { attempts.delete(ip); return 0; }
  return 0;
}

function noteFailure(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, first: now, until: 0 };
  if (!rec.first || (now - rec.first) > WINDOW_MS) { rec.count = 0; rec.first = now; }
  rec.count++;
  if (rec.count >= MAX_FAILURES) rec.until = now + LOCK_MS;
  attempts.set(ip, rec);
  if (attempts.size > 5000) attempts.clear();          // never grow without bound
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch (e) { return false; }
}

export function makeAdminGuard({ adminToken, label = 'admin' } = {}) {
  const token = String(adminToken || '');

  return function adminGuard(req, res, next) {
    if (!token) {
      return res.status(503).json({
        error: 'Admin token is not configured on the server. Set ADMIN_TOKEN in the hosting environment.',
        code: 'ADMIN_TOKEN_MISSING'
      });
    }

    // A correct token always works — the lockout only throttles WRONG guesses, so a mistyping
    // owner can never be locked out of their own dashboard.
    const ip = clientIp(req);
    const supplied = String(req.get('x-admin-token') || req.query.token || req.body?.adminToken || '');
    if (supplied && safeEqual(supplied, token)) {
      attempts.delete(ip);
      return next();
    }

    const waitMs = lockedFor(ip);
    if (waitMs > 0) {
      res.set('Retry-After', String(Math.ceil(waitMs / 1000)));
      return res.status(429).json({
        error: 'Too many failed admin attempts. Try again in ' + Math.ceil(waitMs / 60000) + ' minute(s).',
        code: 'ADMIN_LOCKED'
      });
    }

    noteFailure(ip);
    return res.status(401).json({ error: 'Unauthorized - send the admin token in the x-admin-token header.', code: 'ADMIN_UNAUTHORIZED' });
  };
}

// True when the request carries the configured token (used for optional inline checks).
export function adminTokenMatches(req, adminToken) {
  const token = String(adminToken || '');
  if (!token) return false;
  const supplied = String(req.get('x-admin-token') || req.query.token || '');
  return !!supplied && safeEqual(supplied, token);
}
