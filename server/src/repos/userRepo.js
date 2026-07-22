'use strict';

// ---------------------------------------------------------------------------
// users table data access (KAN-14 / C10-C13).
//
// Email is normalised (trim + lowercase) on every write and lookup per the
// KAN-12 migration note: uniqueness is enforced on lower(email), not a plain
// UNIQUE(email) column.
// ---------------------------------------------------------------------------

const { getPool } = require('../db/pool');

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

// SQLSTATE for a unique-constraint violation (Postgres). Left to propagate
// from createUser so callers can map it to a 409, not a 500.
const UNIQUE_VIOLATION = '23505';

async function createUser(email, passwordHash) {
  const pool = await getPool();
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
    [normalizeEmail(email), passwordHash]
  );
  return rows[0];
}

async function findUserByEmail(email) {
  const pool = await getPool();
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, created_at FROM users WHERE lower(email) = $1',
    [normalizeEmail(email)]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const pool = await getPool();
  const { rows } = await pool.query(
    'SELECT id, email, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

module.exports = { createUser, findUserByEmail, findUserById, normalizeEmail, UNIQUE_VIOLATION };
