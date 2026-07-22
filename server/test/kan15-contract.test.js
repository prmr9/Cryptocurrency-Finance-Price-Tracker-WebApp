'use strict';

// Behavioural contract tests for KAN-15 (C14-C16): GET /portfolios,
// PUT /portfolios, POST /me/import. Mirrors the house pattern used by
// kan14-contract.test.js: a fake pool is injected via the module cache so no
// AWS/DB is touched, driven over a REAL ephemeral HTTP server using Node's
// built-in http + global fetch.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const POOL_PATH = require.resolve('../src/db/pool');
const SESSION_PATH = require.resolve('../src/auth/session');
const CONFIG_PATH = require.resolve('../src/auth/config');
const USER_REPO_PATH = require.resolve('../src/repos/userRepo');
const AUTH_ROUTE_PATH = require.resolve('../src/routes/auth');
const PORTFOLIOS_ROUTE_PATH = require.resolve('../src/routes/portfolios');
const ME_ROUTE_PATH = require.resolve('../src/routes/me');
const PORTFOLIOS_DB_PATH = require.resolve('../src/db/portfolios');
const APP_PATH = require.resolve('../src/app');

const FRESH_PATHS = [
  POOL_PATH,
  SESSION_PATH,
  CONFIG_PATH,
  USER_REPO_PATH,
  AUTH_ROUTE_PATH,
  PORTFOLIOS_ROUTE_PATH,
  ME_ROUTE_PATH,
  PORTFOLIOS_DB_PATH,
  APP_PATH,
];

// An in-memory double for users / revoked_sessions / portfolios, matching the
// exact queries issued by userRepo.js, session.js and db/portfolios.js.
function makeFakePool() {
  const users = [];
  const revoked = new Set();
  const portfolios = []; // { id, user_id, name, holdings, version, created_at, updated_at }
  let nextUserId = 1;
  let nextPortfolioId = 1;

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
        const user = { id: `user-${nextUserId++}`, email, password_hash: passwordHash, created_at: new Date() };
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

      // --- portfolios ---
      if (/INSERT INTO portfolios/i.test(sql)) {
        const [userId, name, holdingsJson, expectedVersion] = params;
        const holdings = JSON.parse(holdingsJson);
        const existing = portfolios.find((p) => p.user_id === userId && p.name === name);
        if (!existing) {
          const row = {
            id: `portfolio-${nextPortfolioId++}`,
            user_id: userId,
            name,
            holdings,
            version: 1,
            created_at: new Date(),
            updated_at: new Date(),
          };
          portfolios.push(row);
          return { rows: [row], rowCount: 1 };
        }
        if (existing.version !== expectedVersion) {
          return { rows: [], rowCount: 0 };
        }
        existing.holdings = holdings;
        existing.version += 1;
        existing.updated_at = new Date();
        return { rows: [existing], rowCount: 1 };
      }
      if (/SELECT .* FROM portfolios WHERE user_id = \$1 AND name = \$2/i.test(sql)) {
        const [userId, name] = params;
        const row = portfolios.find((p) => p.user_id === userId && p.name === name);
        return { rows: row ? [row] : [] };
      }
      if (/SELECT .* FROM portfolios WHERE user_id = \$1/i.test(sql)) {
        const [userId] = params;
        return { rows: portfolios.filter((p) => p.user_id === userId) };
      }

      return { rows: [] };
    },
  };
}

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

function sessionCookieFrom(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw || !raw.startsWith('session=')) return null;
  return raw.split(';')[0];
}

async function signUpAndGetCookie(baseUrl, email = 'kan15@example.com', password = 'Sup3rSecret!23') {
  const res = await fetch(`${baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.ok(res.status >= 200 && res.status < 300, `signup expected 2xx, got ${res.status}`);
  const cookie = sessionCookieFrom(res);
  assert.ok(cookie, 'signup must issue a session cookie');
  return cookie;
}

test('GET /portfolios without a session returns 401', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const res = await fetch(`${baseUrl}/portfolios`);
    assert.equal(res.status, 401);
  } finally {
    await cleanup();
  }
});

test('GET /portfolios returns only the authenticated user\'s holdings, scoped by session (C14)', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const cookieA = await signUpAndGetCookie(baseUrl, 'user-a@example.com');
    const cookieB = await signUpAndGetCookie(baseUrl, 'user-b@example.com');

    await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ name: 'default', holdings: [{ symbol: 'BTC', shares: 1 }], version: 0 }),
    });

    const resA = await fetch(`${baseUrl}/portfolios`, { headers: { Cookie: cookieA } });
    assert.equal(resA.status, 200);
    const bodyA = await resA.json();
    assert.equal(bodyA.portfolios.length, 1);
    assert.deepEqual(bodyA.portfolios[0].holdings, [{ symbol: 'BTC', shares: 1 }]);

    // A different authenticated user sees none of user A's rows.
    const resB = await fetch(`${baseUrl}/portfolios`, { headers: { Cookie: cookieB } });
    assert.equal(resB.status, 200);
    const bodyB = await resB.json();
    assert.equal(bodyB.portfolios.length, 0);
  } finally {
    await cleanup();
  }
});

test('PUT /portfolios persists holdings and a subsequent GET returns them (C15)', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const cookie = await signUpAndGetCookie(baseUrl);

    const putRes = await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'default', holdings: [{ symbol: 'ETH', shares: 3 }], version: 0 }),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.version, 1);

    const getRes = await fetch(`${baseUrl}/portfolios`, { headers: { Cookie: cookie } });
    const getBody = await getRes.json();
    assert.equal(getBody.portfolios.length, 1);
    assert.deepEqual(getBody.portfolios[0].holdings, [{ symbol: 'ETH', shares: 3 }]);
  } finally {
    await cleanup();
  }
});

test('PUT /portfolios rejects a name outside the server allowlist with 400 before any write', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const cookie = await signUpAndGetCookie(baseUrl);
    const res = await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'not-allowed', holdings: [], version: 0 }),
    });
    assert.equal(res.status, 400);

    const getRes = await fetch(`${baseUrl}/portfolios`, { headers: { Cookie: cookie } });
    const getBody = await getRes.json();
    assert.equal(getBody.portfolios.length, 0);
  } finally {
    await cleanup();
  }
});

test('PUT /portfolios rejects malformed holdings with 400', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const cookie = await signUpAndGetCookie(baseUrl);
    const res = await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'default', holdings: [{ symbol: '', shares: -1 }], version: 0 }),
    });
    assert.equal(res.status, 400);
  } finally {
    await cleanup();
  }
});

test('PUT /portfolios returns 409 with currentVersion on a stale version (optimistic concurrency)', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const cookie = await signUpAndGetCookie(baseUrl);

    const first = await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'default', holdings: [{ symbol: 'BTC', shares: 1 }], version: 0 }),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.version, 1);

    // Stale write: still claims version 0 even though the stored version is now 1.
    const stale = await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'default', holdings: [{ symbol: 'ETH', shares: 9 }], version: 0 }),
    });
    assert.equal(stale.status, 409);
    const staleBody = await stale.json();
    assert.equal(staleBody.error, 'version_conflict');
    assert.equal(staleBody.currentVersion, 1);

    // Data from the first write is untouched.
    const getRes = await fetch(`${baseUrl}/portfolios`, { headers: { Cookie: cookie } });
    const getBody = await getRes.json();
    assert.deepEqual(getBody.portfolios[0].holdings, [{ symbol: 'BTC', shares: 1 }]);
  } finally {
    await cleanup();
  }
});

test('POST /me/import merges incoming holdings into existing rows without data loss (C16)', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const cookie = await signUpAndGetCookie(baseUrl);

    await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'default', holdings: [{ symbol: 'BTC', shares: 1 }], version: 0 }),
    });

    const importRes = await fetch(`${baseUrl}/me/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        default: [{ symbol: 'ETH', shares: 2 }],
        watchlist: [{ symbol: 'SOL', shares: 0 }],
      }),
    });
    assert.equal(importRes.status, 200);
    const importBody = await importRes.json();
    const defaultBySymbol = Object.fromEntries(importBody.imported.default.map((h) => [h.symbol, h.shares]));
    assert.deepEqual(defaultBySymbol, { BTC: 1, ETH: 2 });
    assert.deepEqual(importBody.imported.watchlist, [{ symbol: 'SOL', shares: 0 }]);

    const getRes = await fetch(`${baseUrl}/portfolios`, { headers: { Cookie: cookie } });
    const getBody = await getRes.json();
    const byName = Object.fromEntries(getBody.portfolios.map((p) => [p.name, p.holdings]));
    const gotDefaultBySymbol = Object.fromEntries(byName.default.map((h) => [h.symbol, h.shares]));
    assert.deepEqual(gotDefaultBySymbol, { BTC: 1, ETH: 2 });
    assert.deepEqual(byName.watchlist, [{ symbol: 'SOL', shares: 0 }]);
  } finally {
    await cleanup();
  }
});

test('POST /me/import skips the write for a name whose incoming holdings are empty/absent while an existing row is non-empty', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const cookie = await signUpAndGetCookie(baseUrl);

    const seeded = await fetch(`${baseUrl}/portfolios`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'default', holdings: [{ symbol: 'BTC', shares: 1 }], version: 0 }),
    });
    const seededBody = await seeded.json();
    assert.equal(seededBody.version, 1);

    // Import sends no 'default' entries at all (absent) and an empty watchlist.
    const importRes = await fetch(`${baseUrl}/me/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ watchlist: [] }),
    });
    assert.equal(importRes.status, 200);
    const importBody = await importRes.json();
    assert.deepEqual(importBody.imported.default, [{ symbol: 'BTC', shares: 1 }]);

    // The existing default row's version is untouched (no write happened) --
    // proven by the row still being upsertable at version 1 (not bumped to 2).
    const getRes = await fetch(`${baseUrl}/portfolios`, { headers: { Cookie: cookie } });
    const getBody = await getRes.json();
    const defaultRow = getBody.portfolios.find((p) => p.name === 'default');
    assert.equal(defaultRow.version, 1);
    assert.deepEqual(defaultRow.holdings, [{ symbol: 'BTC', shares: 1 }]);
  } finally {
    await cleanup();
  }
});

test('POST /me/import without a session returns 401', async () => {
  const { baseUrl, cleanup } = await freshServer();
  try {
    const res = await fetch(`${baseUrl}/me/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default: [] }),
    });
    assert.equal(res.status, 401);
  } finally {
    await cleanup();
  }
});
