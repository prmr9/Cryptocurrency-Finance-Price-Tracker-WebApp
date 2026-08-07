'use strict';

// ---------------------------------------------------------------------------
// GET /health (KAN-13 / contract C4).
//
// Thin end-to-end root slice proving the secret -> pool -> query chain of the
// in-VPC backend: it acquires the runtime pool (getPool(), which fetches the RDS
// credential via the IAM role) and runs `select 1`.
//
//   * chain intact  -> 200 { status: 'ok', ...release identity }
//   * DB unreachable / pool exhausted / query hung -> 503 { status: 'unhealthy' }
//
// The DB dependency is checked under a BOUNDED timeout so a hung or exhausted
// pool returns 503 promptly instead of hanging the request. The underlying error
// is logged server-side only; the response body NEVER echoes raw error text.
//
// The 200 body also carries the identity of the release THIS PROCESS is running
// (release_id / git_sha / deploy_id), so a caller can distinguish "some healthy
// backend answered" from "the release I just shipped is serving traffic". That
// distinction is the whole point: a deploy is only released once the new
// identity is live, and after a rollback the previous release's identity comes
// back — automatically, because the restarted process reads the manifest out of
// whichever release directory `current` now points at.
//
// The identity is read from release.json, which deploy-backend-ec2.sh writes
// INTO the release directory. It is resolved relative to __dirname, so it
// describes the deployed artifact rather than any repository state on the box.
// The 503 body is deliberately left untouched: its exact shape is asserted by
// health.test.js as a no-information-leak guarantee.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const { getPool } = require('../db/pool');
const { logger } = require('../observability');

const log = logger.child({ component: 'health' });

// Upper bound on how long the whole DB probe may take before we declare 503.
const HEALTH_TIMEOUT_MS = 2000;

// src/routes/health.js -> <release root>/release.json
const RELEASE_MANIFEST_PATH = path.join(__dirname, '..', '..', 'release.json');

// Only these keys are ever served. An allowlist (rather than spreading the
// parsed manifest) means a future field added to release.json cannot leak out
// of this endpoint by accident.
const PUBLIC_RELEASE_FIELDS = ['release_id', 'git_sha', 'deploy_id', 'deployed_at', 'environment'];

let cachedIdentity;

// Release identity for the 200 body, or {} when there is no manifest — which is
// the normal case for local dev and tests. Absent-means-absent is deliberate:
// a caller that requires proof of a specific release should treat a missing
// identity as "not confirmed", never as "matches".
function getReleaseIdentity() {
  if (cachedIdentity !== undefined) return cachedIdentity;
  try {
    const parsed = JSON.parse(fs.readFileSync(RELEASE_MANIFEST_PATH, 'utf8'));
    cachedIdentity = {};
    for (const key of PUBLIC_RELEASE_FIELDS) {
      if (typeof parsed[key] === 'string' && parsed[key] !== '') cachedIdentity[key] = parsed[key];
    }
  } catch {
    // No manifest (local dev/test), unreadable, or malformed JSON: serve the
    // bare status rather than failing the health check over metadata.
    cachedIdentity = {};
  }
  return cachedIdentity;
}

// Test seam: drop the memoized manifest so a test can point at a different one.
function resetReleaseIdentityCache() {
  cachedIdentity = undefined;
}

// Reject `promise` if it does not settle within `ms`. The timer is cleared on
// settle and unref'd so it never keeps the event loop alive.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function healthHandler(_req, res) {
  let client;
  try {
    const pool = await getPool();
    // Bound the whole probe: connect + query must complete within the budget.
    client = await withTimeout(pool.connect(), HEALTH_TIMEOUT_MS, 'db connect');
    // Belt-and-braces: also cap the query server-side so a slow DB cannot hold
    // the connection past our budget even if the JS timer is starved.
    await client.query(`SET statement_timeout = ${HEALTH_TIMEOUT_MS}`);
    await withTimeout(client.query('select 1'), HEALTH_TIMEOUT_MS, 'db query');
    return res.status(200).json({ status: 'ok', ...getReleaseIdentity() });
  } catch (err) {
    // Log server-side for operators; NEVER leak error text to the client. The
    // 503 body stays exactly as it was — health.test.js pins its shape as a
    // no-information-leak guarantee.
    log.error('DB dependency check failed', { error: err });
    return res.status(503).json({ status: 'unhealthy' });
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  healthHandler,
  HEALTH_TIMEOUT_MS,
  RELEASE_MANIFEST_PATH,
  PUBLIC_RELEASE_FIELDS,
  getReleaseIdentity,
  resetReleaseIdentityCache,
};
