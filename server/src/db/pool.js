'use strict';

// ---------------------------------------------------------------------------
// Runtime Postgres connection pool (KAN-11 / contract C3).
//
// getPool() lazily builds a single pg Pool from credentials fetched at runtime
// via the attached IAM role (secrets.js). There is NO embedded / fallback
// credential path: if the secret fetch fails (e.g. the role is unauthorized),
// getPool() rejects with that error and no connection is opened.
//
// Concurrency: we memoize the IN-FLIGHT createPool() Promise (not the resolved
// pool) so concurrent first callers share one pool. On rejection we reset the
// memo to null so a failed initial fetch is retryable rather than caching a
// broken state.
// ---------------------------------------------------------------------------

const { Pool } = require('pg');
const { fetchDbSecret } = require('./secrets');
const { getRdsCa } = require('./tls');

let poolPromise = null;

async function createPool() {
  const secret = await fetchDbSecret();

  return new Pool({
    connectionString: secret.url,
    ssl: {
      // Pinned RDS CA bundle -> genuine verification; verification is never disabled.
      ca: getRdsCa(),
      rejectUnauthorized: true,
    },
  });
}

/**
 * Return the shared pg Pool, creating it on first call. Callers get the same
 * in-flight Promise until it resolves; if the initial creation rejects, the
 * memo is cleared so the next call retries from scratch.
 *
 * @returns {Promise<import('pg').Pool>}
 */
function getPool() {
  if (poolPromise === null) {
    poolPromise = createPool();
    poolPromise.catch(() => {
      // Failed first fetch (e.g. authorization error) must not be cached.
      poolPromise = null;
    });
  }
  return poolPromise;
}

module.exports = { getPool };
