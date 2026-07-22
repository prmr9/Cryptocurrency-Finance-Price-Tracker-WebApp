'use strict';

// ---------------------------------------------------------------------------
// Password hashing + validation (KAN-14 / C10-C13).
//
// bcryptjs (pure JS, no native build) is the only new dependency this ticket
// introduces. A hash produced here is the ONLY form of a password ever
// persisted (users.password_hash) -- see
// migrations/1710000000000_create-users-user-profiles-portfolios.js.
// ---------------------------------------------------------------------------

const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently truncates/collides beyond 72 bytes; reject before hashing
// rather than let that happen (and to bound hashing to a fixed CPU cost).
// Measured in BYTES (not characters) so multibyte/emoji input can't sneak
// past the check and still exceed bcrypt's usable range.
const MAX_PASSWORD_BYTES = 72;

// Fixed, precomputed bcrypt hash of a throwaway string. POST /login's
// unknown-email branch compares against this so an absent account still
// pays the same bcrypt cost as a real lookup, closing the user-enumeration
// timing side channel. No real password ever needs to match it.
const DUMMY_HASH = '$2b$12$pC4f1u9cysanc4eTGJXMkuTh2cvPwzmqcxjshCIyJXOLkkul.2zXW';

/**
 * Validate a candidate password BEFORE it is ever hashed or persisted.
 * Returns { ok: true } or { ok: false, reason } -- reason is safe to surface
 * to the caller (no internal detail leaked).
 */
function validatePassword(password) {
  if (typeof password !== 'string') {
    return { ok: false, reason: 'password is required' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return { ok: false, reason: `password must be at most ${MAX_PASSWORD_BYTES} bytes` };
  }
  return { ok: true };
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  BCRYPT_COST,
  DUMMY_HASH,
  validatePassword,
  hashPassword,
  verifyPassword,
};
