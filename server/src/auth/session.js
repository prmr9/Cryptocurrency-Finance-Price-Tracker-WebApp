'use strict';

// ---------------------------------------------------------------------------
// Auth session mechanism (KAN-13 / contract C9).
//
// The session is a stateless JWT (HS256) delivered in a Secure/HttpOnly cookie.
// This module delivers the three REUSABLE primitives that KAN-14's auth
// endpoints (signup/login/logout/me) will mount:
//
//   * issueSession(res, { userId })  -> signs a token, sets the cookie, persists
//     the identity across a page refresh (the cookie is sent on every request);
//   * requireSession(req, res, next) -> verifies the cookie's token and rejects
//     (401) missing / invalid / REVOKED tokens;
//   * revokeSession(token)           -> logout: records the token's jti in the
//     authoritative DB denylist AND the in-memory cache so the same token is no
//     longer accepted.
//
// Revocation store: revoked_sessions (migration 1720000000000_auth-sessions.js)
// is authoritative and survives restarts. An in-memory Map fronts it as a fast
// path; sweepDenylist() evicts cache entries once past each token's expiry so
// memory stays bounded (an expired token is already rejected by signature
// verification, so it never needs to stay denylisted).
// ---------------------------------------------------------------------------

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { getJwtSecret } = require('./config');
const { getPool } = require('../db/pool');

const COOKIE_NAME = 'session';
// Session lifetime. Kept modest; refresh/rotation is a later concern.
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// In-memory denylist: jti -> exp (unix SECONDS). Fast path in front of the DB
// table; NOT authoritative (a restart clears it, which is why the DB table
// exists and is always consulted on a cache miss).
const denylist = new Map();

// Secure is env-gated so local http and `node --test` can exercise the real
// cookie, while production (behind the TLS terminator) always gets Secure.
function cookieSecure() {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000, // express expects ms
  };
}

/**
 * Sign a session token for `userId`, set it as the session cookie on `res`, and
 * return the raw token. The cookie is HttpOnly + SameSite=Lax + (env-gated)
 * Secure, so it persists the authenticated identity across page refreshes and
 * is unreadable to page scripts.
 *
 * A session is issued ONLY when a user row with that id exists in the users
 * table (C6): issuance is gated on the DB, so a token is never minted for an id
 * that has no backing user record. Throws (and sets NO cookie) when the userId
 * is missing or unknown.
 *
 * @param {import('express').Response} res
 * @param {{ userId: string }} identity
 * @returns {Promise<string>} the signed JWT
 */
async function issueSession(res, { userId }) {
  if (!userId) {
    throw new Error('issueSession requires a userId');
  }

  // Gate issuance on the user existing: never sign a session for an id with no
  // backing row in the users table. Uses getPool() (pinned-CA TLS) — no new ssl.
  const pool = await getPool();
  const { rows } = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) {
    throw new Error('cannot issue session: no matching user record exists');
  }

  const secret = await getJwtSecret();
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: userId }, secret, {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_SECONDS,
    jwtid: jti,
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return token;
}

/**
 * True if `jti` is denylisted. Checks the in-memory cache first, then falls back
 * to the authoritative DB table (which survives restarts). A DB hit re-warms the
 * cache. `exp` (unix seconds) lets the cache entry carry its own TTL.
 */
async function isRevoked(jti, exp) {
  if (!jti) return false;
  if (denylist.has(jti)) return true;
  const pool = await getPool();
  const { rows } = await pool.query(
    'SELECT 1 FROM revoked_sessions WHERE jti = $1 AND expires_at > now()',
    [jti]
  );
  if (rows.length > 0) {
    if (exp) denylist.set(jti, exp);
    return true;
  }
  return false;
}

/**
 * Express middleware. Reads the session cookie, verifies the JWT, and rejects
 * (401) a missing, invalid/expired, or revoked token. On success it attaches
 * `req.user = { id, jti }` and calls next().
 */
async function requireSession(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'unauthenticated' });
  }

  let payload;
  try {
    const secret = await getJwtSecret();
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (_err) {
    // Bad signature / expired / malformed -> not authenticated. No detail leaked.
    return res.status(401).json({ error: 'unauthenticated' });
  }

  try {
    if (await isRevoked(payload.jti, payload.exp)) {
      return res.status(401).json({ error: 'session revoked' });
    }
  } catch (err) {
    // Fail CLOSED: if the denylist cannot be consulted we cannot prove the token
    // is still valid, so we reject rather than risk honoring a revoked session.
    console.error('[auth] denylist check failed:', err && err.message);
    return res.status(401).json({ error: 'unauthenticated' });
  }

  req.user = { id: payload.sub, jti: payload.jti };
  return next();
}

/**
 * Revoke a session (logout). Records the token's jti in the authoritative
 * revoked_sessions table AND the in-memory cache so the same token is rejected
 * on every subsequent request. Idempotent (ON CONFLICT DO NOTHING). Returns the
 * revoked jti, or null if the token was already invalid (nothing to revoke).
 *
 * @param {string} token raw session JWT
 */
async function revokeSession(token) {
  const secret = await getJwtSecret();
  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (_err) {
    // An invalid token is already un-usable; nothing to persist.
    return null;
  }

  const { jti, sub: userId, exp } = payload;
  // Cache first so an in-process caller is immediately protected even if the DB
  // write is slow.
  denylist.set(jti, exp);

  const pool = await getPool();
  await pool.query(
    `INSERT INTO revoked_sessions (jti, user_id, expires_at, revoked_at)
     VALUES ($1, $2, to_timestamp($3), now())
     ON CONFLICT (jti) DO NOTHING`,
    [jti, userId, exp]
  );
  return jti;
}

/**
 * Evict in-memory denylist entries whose token has already expired (exp in the
 * past). Bounds memory: an expired token is rejected by signature verification
 * anyway, so it no longer needs to occupy the cache. Runs periodically from a
 * timer started in app.js. Returns the number of entries evicted.
 */
function sweepDenylist(nowSeconds = Math.floor(Date.now() / 1000)) {
  let evicted = 0;
  for (const [jti, exp] of denylist) {
    if (typeof exp !== 'number' || exp <= nowSeconds) {
      denylist.delete(jti);
      evicted += 1;
    }
  }
  return evicted;
}

// Test seam: inspect/reset the in-memory cache without exporting the Map itself.
function _denylistSize() {
  return denylist.size;
}
function _resetDenylist() {
  denylist.clear();
}

module.exports = {
  issueSession,
  requireSession,
  revokeSession,
  sweepDenylist,
  isRevoked,
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  _denylistSize,
  _resetDenylist,
};
