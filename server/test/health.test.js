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
const fs = require('fs');
const path = require('path');

const POOL_PATH = require.resolve('../src/db/pool');
const HEALTH_PATH = require.resolve('../src/routes/health');

// Where health.js looks for the manifest deploy-backend-ec2.sh writes into the
// release directory: <release root>/release.json. In a checkout that resolves
// to server/release.json, which the manifest tests below create and remove.
const MANIFEST_PATH = path.join(__dirname, '..', 'release.json');

// Run `fn` with a release.json in place, then always remove it — a leftover
// manifest would silently change what the other tests here observe. `fn` is
// awaited: removing the manifest while an async handler was still reading it
// would make these tests pass without asserting anything.
async function withManifest(contents, fn) {
  fs.writeFileSync(MANIFEST_PATH, typeof contents === 'string' ? contents : JSON.stringify(contents));
  try {
    return await fn();
  } finally {
    fs.rmSync(MANIFEST_PATH, { force: true });
  }
}

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
    // No release.json in a plain checkout, so the body stays exactly the
    // pre-existing shape: release identity is additive, never a rename.
    assert.deepEqual(res.body, { status: 'ok' });
  } finally {
    cleanup();
  }
});

// --- Release identity (deployment correlation) -----------------------------
// A caller must be able to tell "the release I shipped is serving traffic"
// apart from "a healthy backend answered". These cover the reporting path;
// deploy-correlation.test.js covers the plumbing that produces the manifest.

test('healthHandler reports the deployed release identity when a manifest is present', async () => {
  await withManifest(
    {
      release_id: '20260805200712-554666f',
      git_sha: '554666f0aaaabbbbccccddddeeeeffff00001111',
      deploy_id: 'devagent-KAN-99',
      deployed_at: '2026-08-05T20:07:12Z',
      environment: 'nonprod',
    },
    async () => {
      const { healthHandler, cleanup } = freshHealth(healthyPool());
      try {
        const res = makeRes();
        await healthHandler({}, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, 'ok');
        assert.equal(res.body.release_id, '20260805200712-554666f');
        assert.equal(res.body.git_sha, '554666f0aaaabbbbccccddddeeeeffff00001111');
        assert.equal(res.body.deploy_id, 'devagent-KAN-99');
        assert.equal(res.body.environment, 'nonprod');
      } finally {
        cleanup();
      }
    }
  );
});

test('healthHandler serves only allowlisted manifest fields, never arbitrary ones', async () => {
  await withManifest(
    {
      release_id: 'r-1',
      db_password: 'SECRET-LEAK-MARKER',
      jwt_secret: 'SECRET-LEAK-MARKER',
    },
    async () => {
      const { healthHandler, cleanup } = freshHealth(healthyPool());
      try {
        const res = makeRes();
        await healthHandler({}, res);
        assert.equal(res.body.release_id, 'r-1');
        assert.equal(res.body.db_password, undefined);
        assert.equal(res.body.jwt_secret, undefined);
        assert.doesNotMatch(JSON.stringify(res.body), /SECRET-LEAK-MARKER/);
      } finally {
        cleanup();
      }
    }
  );
});

test('healthHandler still answers 200 when the manifest is malformed', async () => {
  await withManifest('{ this is not json', async () => {
    const { healthHandler, cleanup } = freshHealth(healthyPool());
    try {
      const res = makeRes();
      await healthHandler({}, res);
      // Unreadable metadata must never turn a healthy backend into a failure.
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { status: 'ok' });
    } finally {
      cleanup();
    }
  });
});

test('the 503 body carries no release identity, preserving its no-leak shape', async () => {
  await withManifest({ release_id: 'r-1', git_sha: 'deadbeef' }, async () => {
    const failingPool = {
      async connect() {
        throw new Error('db down');
      },
    };
    const { healthHandler, cleanup } = freshHealth(failingPool);
    try {
      const res = makeRes();
      await healthHandler({}, res);
      assert.equal(res.statusCode, 503);
      assert.deepEqual(res.body, { status: 'unhealthy' });
    } finally {
      cleanup();
    }
  });
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
