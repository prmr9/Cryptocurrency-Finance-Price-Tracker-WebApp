'use strict';

// Behavioural tests for GET /health's handler (KAN-13 / contract C4).
//
// healthHandler runs the secret->pool->query chain via getPool(). We inject a
// fake pool through the module cache (mirroring pool-memoization.test.js) so no
// AWS/DB is touched, then assert:
//   * healthy chain    -> 200 { status: 'ok' } (AC 2);
//   * DB failure/hang  -> 503 { status: 'unhealthy' } with NO raw error text in
//                         the body (AC 3).

const test = require('node:test');
const assert = require('node:assert');

const POOL_PATH = require.resolve('../src/db/pool');
const HEALTH_PATH = require.resolve('../src/routes/health');

// Load a fresh health.js with getPool replaced by a fake returning `pool`.
function freshHealth(poolImpl) {
  delete require.cache[HEALTH_PATH];
  require.cache[POOL_PATH] = {
    id: POOL_PATH,
    filename: POOL_PATH,
    loaded: true,
    exports: { getPool: async () => poolImpl },
  };
  const mod = require('../src/routes/health');
  return {
    healthHandler: mod.healthHandler,
    cleanup() {
      delete require.cache[HEALTH_PATH];
      delete require.cache[POOL_PATH];
    },
  };
}

// Minimal express-style res capturing status + json body.
function makeRes() {
  return {
    statusCode: undefined,
    body: undefined,
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

// A fake pool whose client runs `select 1` successfully.
function healthyPool() {
  return {
    async connect() {
      return {
        async query() {
          return { rows: [{ '?column?': 1 }] };
        },
        release() {},
      };
    },
  };
}

test('healthHandler returns 200 {status:"ok"} when select 1 succeeds', async () => {
  const { healthHandler, cleanup } = freshHealth(healthyPool());
  try {
    const res = makeRes();
    await healthHandler({}, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  } finally {
    cleanup();
  }
});

test('healthHandler returns 503 {status:"unhealthy"} when the DB query rejects, with no error text leaked', async () => {
  const secretErr = 'connect ECONNREFUSED 10.0.0.5:5432 — SECRET-LEAK-MARKER';
  const failingPool = {
    async connect() {
      return {
        async query(sql) {
          if (/select 1/i.test(sql)) throw new Error(secretErr);
          return { rows: [] }; // allow the statement_timeout SET
        },
        release() {},
      };
    },
  };
  const { healthHandler, cleanup } = freshHealth(failingPool);
  try {
    const res = makeRes();
    await healthHandler({}, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { status: 'unhealthy' });
    // The response body must not echo the underlying error text.
    assert.doesNotMatch(JSON.stringify(res.body), /SECRET-LEAK-MARKER/);
    assert.doesNotMatch(JSON.stringify(res.body), /ECONNREFUSED/);
  } finally {
    cleanup();
  }
});

test('healthHandler returns 503 when getPool itself rejects (DB unreachable)', async () => {
  delete require.cache[HEALTH_PATH];
  require.cache[POOL_PATH] = {
    id: POOL_PATH,
    filename: POOL_PATH,
    loaded: true,
    exports: {
      getPool: async () => {
        throw new Error('AccessDeniedException — SECRET-LEAK-MARKER');
      },
    },
  };
  const { healthHandler } = require('../src/routes/health');
  try {
    const res = makeRes();
    await healthHandler({}, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { status: 'unhealthy' });
    assert.doesNotMatch(JSON.stringify(res.body), /SECRET-LEAK-MARKER/);
  } finally {
    delete require.cache[HEALTH_PATH];
    delete require.cache[POOL_PATH];
  }
});
