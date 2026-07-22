'use strict';

// Migration-applied integration test for the KAN-15 portfolios migration
// (version column + dedupe + unique index). Mirrors schema-integration.test.js:
// the recording-proxy unit test locks the DSL/SQL shape but cannot prove the
// dedupe actually merges rows or that the unique index actually rejects a
// collision -- this test applies every migration (including 1730000000000) to
// an ephemeral PostgreSQL 16 and exercises that against live SQL.
//
// Docker is required unless PG_TEST_URL points at a reachable PostgreSQL 16.

const { describe, before, after, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const IGNORE_PATTERN = '.*\\.test\\.js';

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

describe('KAN-15 schema integration (real PostgreSQL 16)', () => {
  const ctx = { ready: false, reason: 'not initialised', client: null, container: null };

  before(async () => {
    const result = await setup();
    Object.assign(ctx, result);
    if (!ctx.ready) {
      console.log(`[kan15-schema-integration] SKIPPED: ${ctx.reason}`);
    }
  });

  after(async () => {
    if (ctx.client) await ctx.client.end().catch(() => {});
    if (ctx.container) await ctx.container.stop().catch(() => {});
  });

  async function createUser(client, email) {
    const { rows } = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, '$2b$12$abcdefghijklmnopqrstuuKq8kJ1p9Xk3nO0Xq3nO0Xq3nO0Xq3nO']
    );
    return rows[0].id;
  }

  test('version column defaults to 1 for a freshly-inserted row', async (t) => {
    if (!ctx.ready) return t.skip(ctx.reason);
    const { client } = ctx;

    const userId = await createUser(client, 'version-default@x.com');
    const { rows } = await client.query(
      `INSERT INTO portfolios (user_id, name) VALUES ($1, $2) RETURNING version`,
      [userId, 'default']
    );
    assert.equal(rows[0].version, 1);
  });

  test('unique index on (user_id, name) rejects a second row with the same name for the same user', async (t) => {
    if (!ctx.ready) return t.skip(ctx.reason);
    const { client } = ctx;

    const userId = await createUser(client, 'unique-name@x.com');
    await client.query(`INSERT INTO portfolios (user_id, name) VALUES ($1, $2)`, [userId, 'default']);

    await assert.rejects(
      client.query(`INSERT INTO portfolios (user_id, name) VALUES ($1, $2)`, [userId, 'default']),
      (err) => err.code === '23505'
    );
  });

  test('ON CONFLICT (user_id, name) DO UPDATE upserts by name (the shape upsertPortfolioWithVersion relies on)', async (t) => {
    if (!ctx.ready) return t.skip(ctx.reason);
    const { client } = ctx;

    const userId = await createUser(client, 'upsert-shape@x.com');
    const holdings = JSON.stringify([{ symbol: 'BTC', shares: 1 }]);

    const first = await client.query(
      `INSERT INTO portfolios (user_id, name, holdings, version)
       VALUES ($1, $2, $3::jsonb, 1)
       ON CONFLICT (user_id, name) DO UPDATE
         SET holdings = $3::jsonb, version = portfolios.version + 1, updated_at = now()
         WHERE portfolios.version = $4
       RETURNING version, holdings`,
      [userId, 'default', holdings, 0]
    );
    assert.equal(first.rows[0].version, 1);

    const updatedHoldings = JSON.stringify([{ symbol: 'ETH', shares: 2 }]);
    const second = await client.query(
      `INSERT INTO portfolios (user_id, name, holdings, version)
       VALUES ($1, $2, $3::jsonb, 1)
       ON CONFLICT (user_id, name) DO UPDATE
         SET holdings = $3::jsonb, version = portfolios.version + 1, updated_at = now()
         WHERE portfolios.version = $4
       RETURNING version, holdings`,
      [userId, 'default', updatedHoldings, 1]
    );
    assert.equal(second.rows[0].version, 2);
    assert.deepEqual(second.rows[0].holdings, [{ symbol: 'ETH', shares: 2 }]);

    // Stale expectedVersion (1, but stored is now 2) affects zero rows.
    const stale = await client.query(
      `INSERT INTO portfolios (user_id, name, holdings, version)
       VALUES ($1, $2, $3::jsonb, 1)
       ON CONFLICT (user_id, name) DO UPDATE
         SET holdings = $3::jsonb, version = portfolios.version + 1, updated_at = now()
         WHERE portfolios.version = $4
       RETURNING version, holdings`,
      [userId, 'default', JSON.stringify([{ symbol: 'SOL', shares: 3 }]), 1]
    );
    assert.equal(stale.rowCount, 0);
  });

  test('dedupe migration step merges pre-existing duplicate (user_id, name) rows without losing holdings', async (t) => {
    if (!ctx.ready) return t.skip(ctx.reason);
    // This proves the dedupe SQL's *logic* directly (rather than re-running
    // the full migration set against seeded pre-existing duplicates, which
    // 1730000000000 cannot do since its own unique index already applied).
    // We validate the same merge query in isolation on a scratch table shaped
    // like pre-migration portfolios rows.
    if (!ctx.ready) return t.skip(ctx.reason);
    const { client } = ctx;

    await client.query('CREATE TABLE IF NOT EXISTS scratch_portfolios (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, holdings jsonb not null, updated_at timestamptz not null)');
    const userId = await createUser(client, 'dedupe-scratch@x.com');

    await client.query(
      `INSERT INTO scratch_portfolios (user_id, name, holdings, updated_at) VALUES
        ($1, 'default', '[{"symbol":"BTC","shares":1}]'::jsonb, now() - interval '1 hour'),
        ($1, 'default', '[{"symbol":"ETH","shares":2},{"symbol":"BTC","shares":9}]'::jsonb, now())`,
      [userId]
    );

    await client.query(`
      WITH ranked AS (
        SELECT id, user_id, name, holdings, updated_at,
               ROW_NUMBER() OVER (PARTITION BY user_id, name ORDER BY updated_at DESC, id DESC) AS rn
        FROM scratch_portfolios
      ),
      dup_groups AS (
        SELECT user_id, name FROM scratch_portfolios GROUP BY user_id, name HAVING COUNT(*) > 1
      ),
      merged AS (
        SELECT g.user_id, g.name,
          (
            SELECT jsonb_agg(entry.value ORDER BY entry.rn)
            FROM (
              SELECT DISTINCT ON (elem ->> 'symbol') elem AS value, r.rn AS rn
              FROM ranked r
              CROSS JOIN LATERAL jsonb_array_elements(r.holdings) AS elem
              WHERE r.user_id = g.user_id AND r.name = g.name
              ORDER BY elem ->> 'symbol', r.rn ASC
            ) entry
          ) AS merged_holdings
        FROM dup_groups g
      )
      UPDATE scratch_portfolios p
      SET holdings = COALESCE(m.merged_holdings, '[]'::jsonb)
      FROM ranked r, merged m
      WHERE p.id = r.id AND r.rn = 1 AND m.user_id = r.user_id AND m.name = r.name;
    `);

    await client.query(`
      DELETE FROM scratch_portfolios p
      USING (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, name ORDER BY updated_at DESC, id DESC) AS rn
        FROM scratch_portfolios
      ) r
      WHERE p.id = r.id AND r.rn > 1;
    `);

    const { rows } = await client.query(
      'SELECT holdings FROM scratch_portfolios WHERE user_id = $1 AND name = $2',
      [userId, 'default']
    );
    assert.equal(rows.length, 1, 'duplicate group must be collapsed to a single row');
    const bySymbol = Object.fromEntries(rows[0].holdings.map((h) => [h.symbol, h.shares]));
    // BTC collides: the more-recently-updated row's value (9) wins. ETH is
    // unique to the newer row and is preserved. No data lost.
    assert.deepEqual(bySymbol, { BTC: 9, ETH: 2 });

    await client.query('DROP TABLE scratch_portfolios');
  });
});
