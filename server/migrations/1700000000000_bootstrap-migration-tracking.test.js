'use strict';

// Tests for the KAN-11 / contract C5 baseline migration.
//
// This migration is DELIBERATELY a documented no-op: it exists only to seat the
// node-pg-migrate harness and record a baseline row in `pgmigrations`. The
// behaviour worth proving is therefore the negative one — it must run cleanly
// but must NOT touch the schema (no createExtension, no createTable, no
// privileged/superuser op). node-pg-migrate performs every schema change
// through methods on the injected `pgm` object, so a recording proxy over
// `pgm` catches any future edit that smuggles real work into the baseline.

const migration = require('./1700000000000_bootstrap-migration-tracking');

// A `pgm` stand-in that records every property access / method call. Anything
// the migration does to the database has to reach through here.
function makeRecordingPgm() {
  const calls = [];
  const handler = {
    get(_target, prop) {
      // Guard against accidental promise-unwrapping treating the proxy as a
      // thenable; that access is framework noise, not a schema op.
      if (prop === 'then') return undefined;
      calls.push(String(prop));
      return (...args) => {
        calls.push(`${String(prop)}(${args.length})`);
      };
    },
  };
  return { pgm: new Proxy({}, handler), calls };
}

describe('migration 1700000000000_bootstrap-migration-tracking', () => {
  test('exposes the node-pg-migrate module contract', () => {
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
    // Explicitly declared as undefined — the runner relies on this key existing.
    expect(migration).toHaveProperty('shorthands');
    expect(migration.shorthands).toBeUndefined();
  });

  describe('up() — baseline marker', () => {
    test('runs without error and returns nothing (happy path)', () => {
      const { pgm } = makeRecordingPgm();
      expect(() => migration.up(pgm)).not.toThrow();
      expect(migration.up(pgm)).toBeUndefined();
    });

    test('performs NO schema operation — no domain/privileged work (most likely to break)', () => {
      const { pgm, calls } = makeRecordingPgm();
      migration.up(pgm);
      expect(calls).toEqual([]);
    });

    test('is callable with no pgm argument, since it ignores pgm (error path)', () => {
      expect(() => migration.up()).not.toThrow();
    });
  });

  describe('down() — nothing to undo', () => {
    test('runs without error and returns nothing (happy path)', () => {
      const { pgm } = makeRecordingPgm();
      expect(() => migration.down(pgm)).not.toThrow();
      expect(migration.down(pgm)).toBeUndefined();
    });

    test('performs NO schema operation (most likely to break)', () => {
      const { pgm, calls } = makeRecordingPgm();
      migration.down(pgm);
      expect(calls).toEqual([]);
    });

    test('is callable with no pgm argument (error path)', () => {
      expect(() => migration.down()).not.toThrow();
    });
  });
});
