'use strict';

// ---------------------------------------------------------------------------
// /auth endpoints (KAN-14 / contracts C10-C13): signup/login/logout/me.
// Mounted at /auth by app.js. Session primitives (issueSession/
// requireSession/revokeSession) live in ../auth/session.js; password hashing
// lives in ../auth/password.js; user persistence lives in ../repos/userRepo.js.
// ---------------------------------------------------------------------------

const express = require('express');

const { hashPassword, verifyPassword, validatePassword, DUMMY_HASH } = require('../auth/password');
const { createUser, findUserByEmail, findUserById, UNIQUE_VIOLATION } = require('../repos/userRepo');
const {
  issueSession,
  requireSession,
  revokeSession,
  SESSION_COOKIE_NAME,
  cookieClearOptions,
} = require('../auth/session');

const router = express.Router();

// Single shared body for every login failure: unknown email and wrong
// password must be indistinguishable to the caller.
const INVALID_CREDENTIALS = { error: 'invalid email or password' };

// C10 -- signup: validate the password, hash it, persist the user, and issue
// a session so a fresh signup is immediately authenticated.
router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const check = validatePassword(password);
  if (!check.ok) {
    return res.status(400).json({ error: check.reason });
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash);
    await issueSession(res, { userId: user.id });
    return res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    if (err && err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'email already registered' });
    }
    console.error('[auth] signup failed:', err && err.message);
    return res.status(500).json({ error: 'signup failed' });
  }
});

// C11 -- login: verify credentials and issue a session cookie. Unknown email
// and wrong password return the identical generic 401; the unknown-email
// branch still runs a bcrypt compare (against a fixed dummy hash) so the
// response time doesn't leak whether the account exists.
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    const match = await verifyPassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    await issueSession(res, { userId: user.id });
    return res.status(200).json({ id: user.id, email: user.email });
  } catch (err) {
    console.error('[auth] login failed:', err && err.message);
    return res.status(500).json({ error: 'login failed' });
  }
});

// C12 -- logout: revoke the session (DB denylist + in-memory cache) and clear
// the cookie. Idempotent: a missing/already-invalid cookie is still a 200.
router.post('/logout', async (req, res) => {
  const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  if (token) {
    await revokeSession(token);
  }
  res.clearCookie(SESSION_COOKIE_NAME, cookieClearOptions());
  return res.status(200).json({ ok: true });
});

// C13 -- me: requireSession rejects missing/invalid/revoked sessions (401);
// on success return the public profile only, never the password hash.
router.get('/me', requireSession, async (req, res) => {
  const user = await findUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  return res.status(200).json({ id: user.id, email: user.email });
});

module.exports = { router };
