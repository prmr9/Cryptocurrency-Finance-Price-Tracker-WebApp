'use strict';

// ---------------------------------------------------------------------------
// GET /health (KAN-13 / contract C4).
//
// Thin end-to-end root slice proving the secret -> pool -> query chain of the
// in-VPC backend: it acquires the runtime pool (getPool(), which fetches the RDS
// credential via the IAM role) and runs `select 1`.
//
//   * chain intact  -> 200 { status: 'ok' }
//   * DB unreachable / pool exhausted / query hung -> 503 { status: 'unhealthy' }
//
// The DB dependency is checked under a BOUNDED timeout so a hung or exhausted
// pool returns 503 promptly instead of hanging the request. The underlying error
// is logged server-side only; the response body NEVER echoes raw error text.
// ---------------------------------------------------------------------------

const { getPool } = require('../db/pool');

// Upper bound on how long the whole DB probe may take before we declare 503.
const HEALTH_TIMEOUT_MS = 2000;

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
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    // Log server-side for operators; NEVER leak error text to the client.
    console.error('[health] DB dependency check failed:', err && err.message);
    return res.status(503).json({ status: 'unhealthy' });
  } finally {
    if (client) client.release();
  }
}

module.exports = { healthHandler, HEALTH_TIMEOUT_MS };
