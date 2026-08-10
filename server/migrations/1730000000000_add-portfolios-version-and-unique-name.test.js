'use strict';

// Fast unit test for the KAN-15 portfolios migration (version column + dedupe
// + unique index). Mirrors 1710000000000_create-users-user-profiles-portfolios.test.js:
// a recording Proxy over `pgm` captures the exact DSL/SQL call shape without
// touching a database. Real-database behaviour (the dedupe actually merging
// duplicate rows, the unique index actually rejecting a collision) is proven
// separately by an integration test against real PostgreSQL.

const migration = require('./1730000000000_add-portfolios-version-and-unique-name');

function makeRecordingPgm() {
  const calls = [];
  const handler = {
    get(_target, prop) {
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

describe('migration 1730000000000_add-portfolios-version-and-unique-name', () => {
  test('exposes the node-pg-migrate module contract (shorthands/up/down)', () => {
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
    expect(migration).toHaveProperty('shorthands');
    expect(migration.shorthands).toBeUndefined();
  });

  describe('up()', () => {
    let calls;
    beforeEach(() => {
      const rec = makeRecordingPgm();
      migration.up(rec.pgm);
      calls = rec.calls;
    });

    test('adds a NOT NULL version integer column defaulted to 1', () => {
      const addColumnCall = calls.find((c) => c.method === 'addColumn' && c.args[0] === 'portfolios');
      expect(addColumnCall).toBeTruthy();
      expect(addColumnCall.args[1].version).toMatchObject({ type: 'integer', notNull: true, default: 1 });
    });

    test('emits a dedupe step (merge UPDATE + DELETE on duplicate user_id+name groups) before the CREATE UNIQUE INDEX', () => {
      const sqlCalls = calls.filter((c) => c.method === 'sql');
      const indexCallIdx = calls.findIndex((c) => c.method === 'createIndex');
      expect(indexCallIdx).toBeGreaterThan(-1);

      // At least one dedupe statement (UPDATE merging holdings, or DELETE of
      // redundant rows) appears strictly before createIndex in call order.
      const dedupeBeforeIndex = calls.some(
        (c, idx) =>
          idx < indexCallIdx &&
          c.method === 'sql' &&
          typeof c.args[0] === 'string' &&
          /group by user_id, name having count\(\*\) > 1/i.test(c.args[0])
      );
      expect(dedupeBeforeIndex).toBe(true);

      const deleteBeforeIndex = calls.some(
        (c, idx) =>
          idx < indexCallIdx &&
          c.method === 'sql' &&
          typeof c.args[0] === 'string' &&
          /delete from portfolios/i.test(c.args[0])
      );
      expect(deleteBeforeIndex).toBe(true);

      // Sanity: the merge step actually unions by `symbol` and keeps the
      // most-recently-updated row on a collision (rn = row_number over
      // updated_at desc).
      const mergeSql = sqlCalls.find((c) => /jsonb_array_elements/i.test(c.args[0]));
      expect(mergeSql).toBeTruthy();
      expect(mergeSql.args[0]).toMatch(/symbol/i);
      expect(mergeSql.args[0]).toMatch(/updated_at desc/i);
    });

    test('creates a UNIQUE index named portfolios_user_id_name_idx on (user_id, name)', () => {
      const idx = calls.find((c) => c.method === 'createIndex' && c.args[0] === 'portfolios');
      expect(idx).toBeTruthy();
      expect(idx.args[1]).toEqual(['user_id', 'name']);
      expect(idx.args[2]).toMatchObject({ unique: true, name: 'portfolios_user_id_name_idx' });
    });

    test('emits no extension-creating DDL anywhere', () => {
      const strings = calls
        .filter((c) => typeof c.args[0] === 'string')
        .map((c) => c.args[0]);
      for (const s of strings) {
        expect(s).not.toMatch(/create\s+extension/i);
      }
    });
  });

  describe('down()', () => {
    test('drops the unique index, then the version column', () => {
      const { pgm, calls } = makeRecordingPgm();
      migration.down(pgm);

      const dropIndexCall = calls.find((c) => c.method === 'dropIndex');
      expect(dropIndexCall).toBeTruthy();
      expect(dropIndexCall.args[0]).toBe('portfolios');
      expect(dropIndexCall.args[1]).toEqual(['user_id', 'name']);

      const dropColumnCall = calls.find((c) => c.method === 'dropColumn');
      expect(dropColumnCall).toBeTruthy();
      expect(dropColumnCall.args).toEqual(['portfolios', 'version']);
    });
  });
});
