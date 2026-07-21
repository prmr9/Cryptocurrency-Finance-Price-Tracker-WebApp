'use strict';

// Behavioural tests for getPool()'s concurrency memoization (KAN-11 / C3,
// criterion 5). We inject a fake fetchDbSecret via the module cache so no AWS
// call or real DB connection happens (pg's Pool constructor does not connect
// until first use). We assert:
//   * concurrent first callers share ONE in-flight promise;
//   * a rejected first fetch (e.g. an unauthorized IAM role) is NOT cached —
//     the memo resets to null so the next call retries from scratch.

const test = require('node:test');
const assert = require('node:assert');

const SECRETS_PATH = require.resolve('../src/db/secrets');
const POOL_PATH = require.resolve('../src/db/pool');

// Load a FRESH copy of pool.js with fetchDbSecret replaced by `fetchImpl`.
function freshPool(fetchImpl) {
  delete require.cache[POOL_PATH];
  require.cache[SECRETS_PATH] = {
    id: SECRETS_PATH,
    filename: SECRETS_PATH,
    loaded: true,
    exports: { fetchDbSecret: fetchImpl },
  };
  const mod = require('../src/db/pool');
  return {
    getPool: mod.getPool,
    cleanup() {
      delete require.cache[POOL_PATH];
      delete require.cache[SECRETS_PATH];
    },
  };
}

test('concurrent first callers share a single in-flight pool promise', async () => {
  const { getPool, cleanup } = freshPool(async () => ({
    url: 'postgres://u:pw@127.0.0.1:5432/db',
  }));
  try {
    const p1 = getPool();
    const p2 = getPool();
    // Same memoized in-flight Promise — not two separate pool creations.
    assert.strictEqual(p1, p2);
    const pool = await p1;
    await pool.end(); // no-op cleanup; pool never actually connected
  } finally {
    cleanup();
  }
});

test('a failed initial fetch is not cached — the next getPool() retries', async () => {
  let attempts = 0;
  const authError = Object.assign(new Error('AccessDeniedException'), {
    name: 'AccessDeniedException',
  });
  const { getPool, cleanup } = freshPool(async () => {
    attempts += 1;
    if (attempts === 1) throw authError; // unauthorized on first try
    return { url: 'postgres://u:pw@127.0.0.1:5432/db' };
  });
  try {
    const first = getPool();
    await assert.rejects(first, (err) => err === authError);

    // Memo was reset on rejection -> a brand new promise, and a real retry.
    const second = getPool();
    assert.notStrictEqual(first, second);
    const pool = await second;
    assert.equal(attempts, 2);
    await pool.end();
  } finally {
    cleanup();
  }
});
