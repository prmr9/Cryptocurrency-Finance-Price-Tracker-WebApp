'use strict';

// ---------------------------------------------------------------------------
// portfolios table data access (KAN-15 / contracts C14-C16).
//
// Every read is scoped by user_id -- there is no query here that accepts a
// caller-supplied user id from outside the session (see routes/portfolios.js
// and routes/me.js, both gated by requireSession).
//
// upsertPortfolioWithVersion implements optimistic concurrency: the
// ON CONFLICT (user_id, name) DO UPDATE only fires when the stored `version`
// still matches the caller's expectedVersion. A stale/mismatched version (or a
// version that's simply wrong for an existing row) yields rowCount === 0 with
// no rows returned, which callers map to a 409. A brand-new row is inserted
// unconditionally regardless of expectedVersion -- there is nothing to
// conflict with yet.
// ---------------------------------------------------------------------------

const { getPool } = require('./pool');

const PORTFOLIO_COLUMNS = 'id, user_id, name, holdings, version, created_at, updated_at';

async function getPortfoliosByUserId(userId) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT ${PORTFOLIO_COLUMNS} FROM portfolios WHERE user_id = $1`,
    [userId]
  );
  return rows;
}

async function getPortfolioByUserAndName(userId, name) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT ${PORTFOLIO_COLUMNS} FROM portfolios WHERE user_id = $1 AND name = $2`,
    [userId, name]
  );
  return rows[0] || null;
}

async function upsertPortfolioWithVersion(userId, name, holdings, expectedVersion) {
  const pool = await getPool();
  const { rows, rowCount } = await pool.query(
    `INSERT INTO portfolios (user_id, name, holdings, version)
     VALUES ($1, $2, $3::jsonb, 1)
     ON CONFLICT (user_id, name) DO UPDATE
       SET holdings = $3::jsonb, version = portfolios.version + 1, updated_at = now()
       WHERE portfolios.version = $4
     RETURNING ${PORTFOLIO_COLUMNS}`,
    [userId, name, JSON.stringify(holdings), expectedVersion]
  );
  return { rows, rowCount };
}

module.exports = {
  getPortfoliosByUserId,
  getPortfolioByUserAndName,
  upsertPortfolioWithVersion,
};
