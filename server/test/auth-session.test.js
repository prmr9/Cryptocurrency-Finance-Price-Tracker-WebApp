'use strict';

// Behavioural tests for the session mechanism (KAN-13 / contract C9, AC 4/7).
//
// A fake pool (injected via the module cache) backs the revoked_sessions table
// with an in-memory Set, so no AWS/DB is touched. We assert:
//   * issueSession sets the 'session' cookie httpOnly + sameSite=lax + path='/'
//     with env-gated Secure (AC 4);
//   * requireSession accepts a valid token and 401s a revoked one (AC 7);
//   * revokeSession records the jti in BOTH the DB table and the in-memory cache
//     (AC 7);
//   * sweepDenylist evicts entries once past the token's exp (AC 7).

const test = require('node:test');
const assert = require('node:assert');

const POOL_PATH = require.resolve('../src/db/pool');
const SESSION_PATH = require.resolve('../src/auth/session');
const CONFIG_PATH = require.resolve('../src/auth/config');

// A DB double: revoked_sessions as an in-memory Set of jti.
function makeFakePool() {
  const revoked = new Set();
  return {
    revoked,
    pool: {
      async query(sql, params) {
        if (/INSERT INTO revoked_sessions/i.test(sql)) {
          revoked.add(params[0]);
          return { rowCount: 1, rows: [] };
        }
        if (/FROM revoked_sessions/i.test(sql)) {
          return { rows: revoked.has(params[0]) ? [{ one: 1 }] : [] };
        }
        return { rows: [] };
      },
    },
  };
}

// Load a fresh session.js with getPool replaced. JWT_SECRET must be set so the
// real config.getJwtSecret resolves.
function freshSession(fakePool) {
  process.env.JWT_SECRET = 'test-signing-key-that-is-at-least-32-chars-long';
  delete process.env.JWT_SECRET_NAME;
  delete require.cache[SESSION_PATH];
  delete require.cache[CONFIG_PATH];
  require.cache[POOL_PATH] = {
    id: POOL_PATH,
    filename: POOL_PATH,
    loaded: true,
    exports: { getPool: async () => fakePool },
  };
  const mod = require('../src/auth/session');
  return {
    session: mod,
    cleanup() {
      delete require.cache[SESSION_PATH];
      delete require.cache[CONFIG_PATH];
      delete require.cache[POOL_PATH];
      mod._resetDenylist();
    },
  };
}

// Capture res.cookie(name, value, options) and status/json.
function makeRes() {
  return {
    cookies: [],
    statusCode: undefined,
    body: undefined,
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('issueSession sets a Secure/HttpOnly/SameSite=Lax session cookie at path /', async () => {
  const { revoked, pool } = makeFakePool();
  const { session, cleanup } = freshSession(pool);
  const prevSecure = process.env.COOKIE_SECURE;
  try {
    // Default (non-production, no COOKIE_SECURE) -> secure gated off.
    delete process.env.COOKIE_SECURE;
    delete process.env.NODE_ENV;
    const res = makeRes();
    const token = await session.issueSession(res, { userId: 'user-123' });
    assert.equal(typeof token, 'string');
    assert.equal(res.cookies.length, 1);
    const c = res.cookies[0];
    assert.equal(c.name, 'session');
    assert.equal(c.options.httpOnly, true);
    assert.equal(c.options.sameSite, 'lax');
    assert.equal(c.options.path, '/');
    assert.equal(c.options.secure, false); // env-gated off outside production

    // Flip the env gate -> Secure becomes true.
    process.env.COOKIE_SECURE = 'true';
    const res2 = makeRes();
    await session.issueSession(res2, { userId: 'user-123' });
    assert.equal(res2.cookies[0].options.secure, true);
    assert.equal(revoked.size, 0);
  } finally {
    if (prevSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = prevSecure;
    cleanup();
  }
});

test('requireSession accepts a valid token, then 401s the SAME token after revokeSession', async () => {
  const { revoked, pool } = makeFakePool();
  const { session, cleanup } = freshSession(pool);
  try {
    // Issue a token.
    const issueRes = makeRes();
    const token = await session.issueSession(issueRes, { userId: 'user-abc' });

    // Valid token -> next() called, req.user populated.
    const req = { cookies: { session: token } };
    let nexted = false;
    const res = makeRes();
    await session.requireSession(req, res, () => {
      nexted = true;
    });
    assert.equal(nexted, true, 'valid token should pass requireSession');
    assert.equal(req.user.id, 'user-abc');
    assert.equal(res.statusCode, undefined);

    // Log out: revoke records jti in DB + cache.
    const jti = await session.revokeSession(token);
    assert.ok(jti, 'revokeSession returns the revoked jti');
    assert.ok(revoked.has(jti), 'jti persisted to revoked_sessions table');
    assert.ok(session._denylistSize() >= 1, 'jti recorded in the in-memory cache');

    // Same token now rejected with 401.
    const req2 = { cookies: { session: token } };
    let nexted2 = false;
    const res2 = makeRes();
    await session.requireSession(req2, res2, () => {
      nexted2 = true;
    });
    assert.equal(nexted2, false, 'revoked token must not pass');
    assert.equal(res2.statusCode, 401);
  } finally {
    cleanup();
  }
});

test('requireSession 401s when no session cookie is present', async () => {
  const { pool } = makeFakePool();
  const { session, cleanup } = freshSession(pool);
  try {
    const res = makeRes();
    let nexted = false;
    await session.requireSession({ cookies: {} }, res, () => {
      nexted = true;
    });
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 401);
  } finally {
    cleanup();
  }
});

test('requireSession rejects a DB-revoked token even after the in-memory cache is cleared (restart)', async () => {
  const { pool } = makeFakePool();
  const { session, cleanup } = freshSession(pool);
  try {
    const token = await session.issueSession(makeRes(), { userId: 'user-x' });
    await session.revokeSession(token);
    // Simulate a process restart: the authoritative DB row remains.
    session._resetDenylist();
    assert.equal(session._denylistSize(), 0);

    const res = makeRes();
    let nexted = false;
    await session.requireSession({ cookies: { session: token } }, res, () => {
      nexted = true;
    });
    assert.equal(nexted, false, 'DB denylist must survive a cache clear');
    assert.equal(res.statusCode, 401);
  } finally {
    cleanup();
  }
});

test('sweepDenylist evicts in-memory entries once past the token exp', async () => {
  const { pool } = makeFakePool();
  const { session, cleanup } = freshSession(pool);
  try {
    const token = await session.issueSession(makeRes(), { userId: 'user-sweep' });
    await session.revokeSession(token);
    assert.equal(session._denylistSize(), 1);

    // Sweep with "now" far in the future -> entry is past exp -> evicted.
    const farFuture = Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60;
    const evicted = session.sweepDenylist(farFuture);
    assert.equal(evicted, 1);
    assert.equal(session._denylistSize(), 0);
  } finally {
    cleanup();
  }
});
