'use strict';

// Fast unit test for the KAN-12 domain schema migration (contracts C6/C7/C8).
//
// Mirrors 1700000000000_bootstrap-migration-tracking.test.js: node-pg-migrate
// performs every schema change through methods on the injected `pgm` builder,
// so a recording Proxy over `pgm` captures the exact DSL shape without touching
// a database. Unlike the baseline's negative test (which asserts NO ops), this
// locks the POSITIVE shape of the schema -- table/column definitions, the
// case-insensitive email index, the 1:1 profile key, jsonb holdings -- and the
// negative invariant that no extension-creating DDL is ever emitted.
//
// Runner: Jest (describe/test/expect globals), matching the co-located baseline
// test. The real-database behaviour (constraints actually rejecting) is proven
// separately by server/test/schema-integration.test.js.

const migration = require('./1710000000000_create-users-user-profiles-portfolios');

// A `pgm` stand-in that records every method call as { method, args }. Method
// calls return a tagged literal wrapper so that results of pgm.func()/pgm.sql()
// embedded inside column definitions (e.g. a column `default`) remain
// inspectable by assertions.
function makeRecordingPgm() {
  const calls = [];
  const handler = {
    get(_target, prop) {
      // Guard against promise-unwrapping treating the proxy as a thenable.
      if (prop === 'then') return undefined;
      const method = String(prop);
      return (...args) => {
        calls.push({ method, args });
        return { __pgLiteral: method, args };
      };
    },
  };
  return { pgm: new Proxy({}, handler), calls };
}

// Recursively collect every string that appears anywhere in the captured calls
// (top-level args, nested column defaults, SQL strings) for negative scans.
function collectStrings(value, out) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

describe('migration 1710000000000_create-users-user-profiles-portfolios', () => {
  test('exposes the node-pg-migrate module contract (shorthands/up/down)', () => {
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
    expect(migration).toHaveProperty('shorthands');
    expect(migration.shorthands).toBeUndefined();
  });

  describe('up() — creates the users/user_profiles/portfolios schema', () => {
    let calls;
    beforeEach(() => {
      const rec = makeRecordingPgm();
      migration.up(rec.pgm);
      calls = rec.calls;
    });

    const createTableCall = (name) =>
      calls.find((c) => c.method === 'createTable' && c.args[0] === name);

    test('creates all three tables', () => {
      expect(createTableCall('users')).toBeTruthy();
      expect(createTableCall('user_profiles')).toBeTruthy();
      expect(createTableCall('portfolios')).toBeTruthy();
    });

    test('users: id uuid PK default gen_random_uuid(), email/password_hash text NOT NULL, created_at timestamptz', () => {
      const cols = createTableCall('users').args[1];
      expect(cols.id).toMatchObject({ type: 'uuid', primaryKey: true });
      expect(cols.id.default.args[0]).toMatch(/gen_random_uuid\(\)/);
      expect(cols.email).toMatchObject({ type: 'text', notNull: true });
      expect(cols.password_hash).toMatchObject({ type: 'text', notNull: true });
      expect(cols.created_at).toMatchObject({ type: 'timestamptz', notNull: true });
    });

    test('email uniqueness is a functional UNIQUE index on lower(email), not a plain UNIQUE column', () => {
      const usersCols = createTableCall('users').args[1];
      // No column-level UNIQUE on the raw email column.
      expect(usersCols.email.unique).toBeFalsy();

      const lowerIndex = calls.find(
        (c) =>
          c.method === 'sql' &&
          typeof c.args[0] === 'string' &&
          /lower\(email\)/i.test(c.args[0])
      );
      expect(lowerIndex).toBeTruthy();
      expect(lowerIndex.args[0]).toMatch(/unique\s+index/i);
    });

    test('user_profiles: user_id is the PRIMARY KEY, FK to users with ON DELETE CASCADE', () => {
      const cols = createTableCall('user_profiles').args[1];
      expect(cols.user_id.primaryKey).toBe(true);
      expect(cols.user_id.references).toBeTruthy();
      expect(cols.user_id.onDelete).toBe('CASCADE');
      expect(cols.display_name).toMatchObject({ type: 'text' });
      expect(cols.avatar_url).toMatchObject({ type: 'text' });
      expect(cols.updated_at).toMatchObject({ type: 'timestamptz', notNull: true });
    });

    test('portfolios: id uuid PK, user_id FK NOT NULL CASCADE, name text NOT NULL, holdings jsonb NOT NULL, timestamps', () => {
      const cols = createTableCall('portfolios').args[1];
      expect(cols.id).toMatchObject({ type: 'uuid', primaryKey: true });
      expect(cols.user_id).toMatchObject({ type: 'uuid', notNull: true, onDelete: 'CASCADE' });
      expect(cols.user_id.references).toBeTruthy();
      expect(cols.name).toMatchObject({ type: 'text', notNull: true });
      expect(cols.holdings).toMatchObject({ type: 'jsonb', notNull: true });
      expect(cols.created_at).toMatchObject({ type: 'timestamptz', notNull: true });
      expect(cols.updated_at).toMatchObject({ type: 'timestamptz', notNull: true });
    });

    test('creates a non-unique index on portfolios(user_id)', () => {
      const idx = calls.find(
        (c) => c.method === 'createIndex' && c.args[0] === 'portfolios' && c.args[1] === 'user_id'
      );
      expect(idx).toBeTruthy();
    });

    test('emits no extension-creating DDL anywhere (keeps tls-and-config.test.js green)', () => {
      const strings = collectStrings(calls, []);
      for (const s of strings) {
        expect(s).not.toMatch(/create\s+extension/i);
      }
    });
  });

  describe('down() — drops tables in reverse dependency order', () => {
    test('drops portfolios, then user_profiles, then users', () => {
      const { pgm, calls } = makeRecordingPgm();
      migration.down(pgm);
      const dropped = calls
        .filter((c) => c.method === 'dropTable')
        .map((c) => c.args[0]);
      expect(dropped).toEqual(['portfolios', 'user_profiles', 'users']);
    });
  });
});
