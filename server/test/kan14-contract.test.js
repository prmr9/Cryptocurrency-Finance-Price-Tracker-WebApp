'use strict';

// Behavioural contract tests for KAN-14 (C10-C13): POST /auth/signup,
// POST /auth/login, POST /auth/logout, GET /auth/me. Mirrors the house
// pattern used by health.test.js / auth-session.test.js: a fake pool is
// injected via the module cache so no AWS/DB is touched. The app is driven
// over a REAL ephemeral HTTP server using Node's built-in http + global
// fetch -- supertest is not a dependency of server/ (see server/package.json),
// so these tests avoid requiring an unpinned/uninstalled package.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const POOL_PATH = require.resolve('../src/db/pool');
const SESSION_PATH = require.resolve('../src/auth/session');
const CONFIG_PATH = require.resolve('../src/auth/config');
const USER_REPO_PATH = require.resolve('../src/repos/userRepo');
const AUTH_ROUTE_PATH = require.resolve('../src/routes/auth');
const APP_PATH = require.resolve('../src/app');

const FRESH_PATHS = [POOL_PATH, SESSION_PATH, CONFIG_PATH, USER_REPO_PATH, AUTH_ROUTE_PATH, APP_PATH];

// An in-memory double for the users + revoked_sessions tables, matching the
// exact queries issued by src/repos/userRepo.js and src/auth/session.js.
function makeFakePool() {
  const users = [];
  const revoked = new Set();
  let nextId = 1;
  return {
    async query(sql, params) {
      if (/INSERT INTO users/i.test(sql)) {
        const [email, passwordHash] = params;
        const lower = email.toLowerCase();
        if (users.some((u) => u.email.toLowerCase() === lower)) {
          const err = new Error('duplicate key value violates unique constraint "users_email_lower_uk"');
          err.code = '23505';
          throw err;
        }
        const user = { id: `user-${nextId++}`, email, password_hash: passwordHash, created_at: new Date() };
        users.push(user);
        return { rows: [{ id: user.id, email: user.email, created_at: user.created_at }] };
      }
      if (/SELECT 1 FROM users WHERE id/i.test(sql)) {
        const exists = users.some((u) => u.id === params[0]);
        return { rows: exists ? [{ one: 1 }] : [] };
      }
      if (/FROM users WHERE lower\(email\)/i.test(sql)) {
        const user = users.find((u) => u.email.toLowerCase() === params[0]);
        return { rows: user ? [user] : [] };
      }
      if (/FROM users WHERE id/i.test(sql)) {
        const user = users.find((u) => u.id === params[0]);
        return { rows: user ? [{ id: user.id, email: user.email, created_at: user.created_at }] : [] };
      }
      if (/INSERT INTO revoked_sessions/i.test(sql)) {
        revoked.add(params[0]);
        return { rowCount: 1, rows: [] };
      }
      if (/FROM revoked_sessions/i.test(sql)) {
        return { rows: revoked.has(params[0]) ? [{ one: 1 }] : [] };
      }
      return { rows: [] };
    },
  };
}

// Boot a fresh app (fresh pool/session/config/userRepo/routes/app modules, so
// no getPool reference or denylist state leaks between tests) on an ephemeral
// HTTP port. One pool instance per server: getPool() is called from multiple
// call sites (userRepo, issueSession's existence check, revokeSession) and
// they must all see the same in-memory rows.
async function freshServer() {
  process.env.JWT_SECRET = 'test-signing-key-that-is-at-least-32-chars-long';
  delete process.env.JWT_SECRET_NAME;
  for (const p of FRESH_PATHS) delete require.cache[p];
  const pool = makeFakePool();
  require.cache[POOL_PATH] = {
    id: POOL_PATH,
    filename: POOL_PATH,
    loaded: true,
    exports: { getPool: async () => pool },
  };

  const { createApp, closeApp } = require('../src/app');
  const session = require('../src/auth/session');
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async cleanup() {
      closeApp(app);
      session._resetDenylist();
      await new Promise((resolve) => server.close(resolve));
      for (const p of FRESH_PATHS) delete require.cache[p];
    },
  };
}

// Extract just the `session=...` name/value pair from a Set-Cookie header (the
// app only ever sets this one cookie, so a single header get() is unambiguous).
function sessionCookieFrom(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw || !raw.startsWith('session=')) return null;
  return raw.split(';')[0];
}

test('POST /auth/signup creates a user whose password_hash is a bcrypt/argon2 hash, never the plaintext password', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const email = 'new@example.com';
    const password = 'CorrectHorseBatteryStaple123!';

    const res = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.ok(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}`);

    const { getPool } = require('../src/db/pool');
    const pool = await getPool();
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE lower(email) = $1', [email]);
    assert.equal(rows.length, 1);
    const hash = rows[0].password_hash;
    assert.notEqual(hash, password);
    assert.match(hash, /^\$2[aby]\$|^\$argon2(id|i|d)\$/);
  } finally {
    await cleanup();
  }
});

test('POST /auth/login authenticates and issues a persistent HttpOnly session that GET /auth/me and POST /auth/logout honor', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const email = 'known@example.com';
    const password = 'Sup3rSecret!23';
    await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie, 'login must set a cookie');
    assert.match(setCookie, /HttpOnly/i);
    const cookie = sessionCookieFrom(loginRes);
    assert.ok(cookie, 'a session cookie must be present');

    const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.email, email);
    assert.ok(meBody.id);
    assert.equal(meBody.password_hash, undefined);
    assert.equal(meBody.passwordHash, undefined);

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.ok(logoutRes.status >= 200 && logoutRes.status < 300);

    const meAfterLogout = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(meAfterLogout.status, 401);
  } finally {
    await cleanup();
  }
});

test('GET /auth/me without a session returns 401 unauthenticated', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const res = await fetch(`${baseUrl}/auth/me`);
    assert.equal(res.status, 401);
  } finally {
    await cleanup();
  }
});
