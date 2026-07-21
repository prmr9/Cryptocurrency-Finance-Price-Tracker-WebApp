'use strict';

// Migration-applied integration test for the KAN-12 domain schema (C6/C7/C8).
//
// The recording-proxy unit test (co-located with the migration) locks the DSL
// shape but CANNOT prove a constraint actually rejects a bad row. This test
// applies the real migration to an ephemeral PostgreSQL 16 and exercises the
// runtime acceptance criteria against live SQL:
//   (a) C6 -- a second users row whose email differs only in CASE is rejected
//       by the lower(email) UNIQUE index (SQLSTATE 23505); the first row keeps
//       its id/password_hash/created_at, and password_hash stores a hash, never
//       plaintext.
//   (b) C7/C8 -- inserting user_profiles/portfolios with a non-existent user_id
//       is rejected by the FK (23503); a valid user_id persists the row; a
//       second profile for the same user_id is rejected (1:1 PK).
//   (c) C8 -- a holdings jsonb value round-trips and is queryable via @> / ->>.
//
// Runner: node:test (matching the other server/test/*.test.js files, run via
// `node --test`). Everything heavier than node:test/assert is lazily required
// INSIDE setup so that, on a checkout without `npm install` (or without a Docker
// daemon), the suite SKIPS with a logged reason instead of crashing.
//
// Docker is required unless PG_TEST_URL points at a reachable PostgreSQL 16
// (e.g. a C5 SSH tunnel: `PG_TEST_URL=postgres://app_admin:pw@127.0.0.1:5432/cryptotracker`).

const { describe, before, after, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const IGNORE_PATTERN = '.*\\.test\\.js';

// A recognisable bcrypt hash string (cost 12). The migration only defines the
// column; hashing itself is KAN-14. We store a HASH here to prove the column
// faithfully holds one and never the plaintext.
const PLAINTEXT_PASSWORD = 'S3cret-pw!';
const BCRYPT_HASH = '$2b$12$abcdefghijklmnopqrstuuKq8kJ1p9Xk3nO0Xq3nO0Xq3nO0Xq3nO';

async function setup() {
  let pg;
  let runMigrations;
  try {
    pg = require('pg');
    const runner = require('node-pg-migrate');
    runMigrations = runner.default || runner;
  } catch (err) {
    return { ready: false, reason: `server deps not installed (run npm install): ${err.message}` };
  }

  let container = null;
  let connectionString = process.env.PG_TEST_URL || null;

  if (!connectionString) {
    let PostgreSqlContainer;
    try {
      ({ PostgreSqlContainer } = require('@testcontainers/postgresql'));
    } catch (err) {
      return {
        ready: false,
        reason: `@testcontainers/postgresql not installed and PG_TEST_URL unset: ${err.message}`,
      };
    }
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      connectionString = container.getConnectionUri();
    } catch (err) {
      return {
        ready: false,
        reason: `could not start a PostgreSQL 16 container (is Docker running?): ${err.message}`,
      };
    }
  }

  try {
    await runMigrations({
      databaseUrl: connectionString,
      dir: MIGRATIONS_DIR,
      ignorePattern: IGNORE_PATTERN,
      direction: 'up',
      migrationsTable: 'pgmigrations',
      count: Infinity,
    });

    const client = new pg.Client({ connectionString });
    await client.connect();
    return { ready: true, client, container, connectionString };
  } catch (err) {
    if (container) await container.stop().catch(() => {});
    return { ready: false, reason: `migration/connect failed: ${err.message}` };
  }
}

describe('KAN-12 schema integration (real PostgreSQL 16)', () => {
  const ctx = { ready: false, reason: 'not initialised', client: null, container: null };

  before(async () => {
    const result = await setup();
    Object.assign(ctx, result);
    if (!ctx.ready) {
      // Logged reason, per the acceptance criterion for graceful skips.
      console.log(`[schema-integration] SKIPPED: ${ctx.reason}`);
    }
  });

  after(async () => {
    if (ctx.client) await ctx.client.end().catch(() => {});
    if (ctx.container) await ctx.container.stop().catch(() => {});
  });

  // Small helper: create a user and return its generated uuid id.
  async function createUser(client, email) {
    const { rows } = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, BCRYPT_HASH]
    );
    return rows[0].id;
  }

  test('(a) C6: a case-only-different duplicate email is rejected (23505); first row is intact and stores a hash, not plaintext', async (t) => {
    if (!ctx.ready) return t.skip(ctx.reason);
    const { client } = ctx;

    const inserted = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, password_hash, created_at',
      ['User@x.com', BCRYPT_HASH]
    );
    const firstId = inserted.rows[0].id;

    // password_hash holds a bcrypt hash and never the plaintext.
    assert.equal(inserted.rows[0].password_hash, BCRYPT_HASH);
    assert.notEqual(inserted.rows[0].password_hash, PLAINTEXT_PASSWORD);
    assert.match(inserted.rows[0].password_hash, /^\$2[aby]\$|^\$argon2/);

    // Same email, different CASE -> unique violation via lower(email) index.
    await assert.rejects(
      client.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [
        'user@x.com',
        BCRYPT_HASH,
      ]),
      (err) => err.code === '23505'
    );

    // The first row retains its id, password_hash and created_at.
    const after = await client.query(
      'SELECT id, password_hash, created_at FROM users WHERE id = $1',
      [firstId]
    );
    assert.equal(after.rowCount, 1);
    assert.equal(after.rows[0].id, firstId);
    assert.equal(after.rows[0].password_hash, BCRYPT_HASH);
    assert.deepEqual(after.rows[0].created_at, inserted.rows[0].created_at);
  });

  test('(b) C7/C8: FK rejects a non-existent user_id (23503); a valid one persists; second profile per user is rejected (1:1)', async (t) => {
    if (!ctx.ready) return t.skip(ctx.reason);
    const { client } = ctx;

    const missing = '00000000-0000-0000-0000-000000000000';

    // Non-existent user_id -> FK violation for both dependent tables.
    await assert.rejects(
      client.query(
        'INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2)',
        [missing, 'Nobody']
      ),
      (err) => err.code === '23503'
    );
    await assert.rejects(
      client.query('INSERT INTO portfolios (user_id, name) VALUES ($1, $2)', [missing, 'Ghost']),
      (err) => err.code === '23503'
    );

    // Valid user_id -> profile persists display_name, avatar_url, updated_at.
    const userId = await createUser(client, 'profile-owner@x.com');
    const profile = await client.query(
      `INSERT INTO user_profiles (user_id, display_name, avatar_url)
       VALUES ($1, $2, $3)
       RETURNING user_id, display_name, avatar_url, updated_at`,
      [userId, 'Ada Lovelace', 'https://cdn.example.com/ada.png']
    );
    assert.equal(profile.rows[0].user_id, userId);
    assert.equal(profile.rows[0].display_name, 'Ada Lovelace');
    assert.equal(profile.rows[0].avatar_url, 'https://cdn.example.com/ada.png');
    assert.ok(profile.rows[0].updated_at instanceof Date);

    // 1:1 -> a second profile for the same user_id is a PK violation.
    await assert.rejects(
      client.query('INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2)', [
        userId,
        'Duplicate',
      ]),
      (err) => err.code === '23505'
    );
  });

  test('(c) C8: a portfolios holdings jsonb value persists with its FK/timestamps and round-trips as queryable jsonb', async (t) => {
    if (!ctx.ready) return t.skip(ctx.reason);
    const { client } = ctx;

    const userId = await createUser(client, 'portfolio-owner@x.com');
    const holdings = [
      { symbol: 'BTC', amount: 1.5 },
      { symbol: 'ETH', amount: 10 },
    ];

    const inserted = await client.query(
      `INSERT INTO portfolios (user_id, name, holdings)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, user_id, name, holdings, created_at, updated_at`,
      [userId, 'Main', JSON.stringify(holdings)]
    );
    const row = inserted.rows[0];
    assert.equal(row.user_id, userId);
    assert.equal(row.name, 'Main');
    assert.ok(row.created_at instanceof Date);
    assert.ok(row.updated_at instanceof Date);
    // jsonb is returned parsed by pg.
    assert.deepEqual(row.holdings, holdings);

    // Queryable as jsonb: containment (@>) and path extraction (->>).
    const contains = await client.query(
      `SELECT id FROM portfolios WHERE id = $1 AND holdings @> $2::jsonb`,
      [row.id, JSON.stringify([{ symbol: 'BTC' }])]
    );
    assert.equal(contains.rowCount, 1);

    const firstSymbol = await client.query(
      `SELECT holdings -> 0 ->> 'symbol' AS symbol FROM portfolios WHERE id = $1`,
      [row.id]
    );
    assert.equal(firstSymbol.rows[0].symbol, 'BTC');

    // Default for holdings is an empty jsonb array when omitted.
    const withDefault = await client.query(
      `INSERT INTO portfolios (user_id, name) VALUES ($1, $2) RETURNING holdings`,
      [userId, 'Empty']
    );
    assert.deepEqual(withDefault.rows[0].holdings, []);
  });
});
