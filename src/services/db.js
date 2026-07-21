// Backend DB connection for the in-VPC API (KAN-11 / Contract C3).
//
// Thin entrypoint over the canonical server DB layer: credentials are fetched
// at RUNTIME from AWS Secrets Manager (server/src/db/secrets.js) and the pool
// pins the RDS CA bundle with rejectUnauthorized:true (server/src/db/pool.js).
// Credentials are NEVER read from raw configuration (env vars / DATABASE_URL),
// and there is no fallback to embedded credentials when the Secrets Manager
// fetch is denied -- the error propagates and no connection is opened.
//
// The secret name is the stable contract (DB_SECRET_NAME); see DATABASE.md §3-4.

const { getPool } = require('../../server/src/db/pool');

// Fetch the secret FIRST (inside getPool), then open the RDS PostgreSQL 16
// connection with the fetched credentials. If the fetch is denied, getPool
// rejects and no connection is opened with fallback credentials.
async function connect() {
  const pool = await getPool();
  await pool.connect();
  return pool;
}

module.exports = { connect };
