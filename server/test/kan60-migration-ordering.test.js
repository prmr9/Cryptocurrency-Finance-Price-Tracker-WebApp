const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Regression guard for KAN-60 (evidence: KAN-57 "CI failed after merge").
//
// Post-merge CI fragility in this repo traces to database migrations. When two
// branches each add a migration under server/migrations and are merged, the
// filename timestamp prefixes can collide or land out of sequence. The migrate
// step (node-pg-migrate, driven by server/migrate.js) discovers and applies
// migrations in lexicographic filename order, so a duplicate prefix or a prefix
// that is smaller than an already-authored one makes migrations apply in a
// different order than they were written -- which is exactly the kind of
// nondeterminism that only surfaces on the post-merge CI run.
//
// This test asserts the invariant that keeps that step deterministic. It FAILS
// the moment a merge introduces a colliding or out-of-order migration timestamp,
// and passes once the offending migration is renamed to a unique, strictly
// increasing prefix.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_RE = /^(\d+)_.+\.js$/;

function allMigrationSources() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
}

function migrationFiles() {
  return allMigrationSources()
    .filter((f) => MIGRATION_RE.test(f))
    .sort();
}

describe('KAN-60: migrations apply deterministically after merges', () => {
  test('every migration filename carries a numeric timestamp prefix', () => {
    const unprefixed = allMigrationSources().filter((f) => !MIGRATION_RE.test(f));
    assert.deepEqual(unprefixed, []);
  });

  test('migration timestamp prefixes are unique (no post-merge collisions)', () => {
    const byTimestamp = new Map();
    for (const f of migrationFiles()) {
      const ts = f.match(MIGRATION_RE)[1];
      const group = byTimestamp.get(ts) || [];
      group.push(f);
      byTimestamp.set(ts, group);
    }
    const collisions = [...byTimestamp.values()].filter((g) => g.length > 1);
    assert.deepEqual(collisions, []);
  });

  test('lexical discovery order matches strictly increasing timestamp order', () => {
    const numeric = migrationFiles().map((f) => Number(f.match(MIGRATION_RE)[1]));
    const sorted = [...numeric].sort((a, b) => a - b);
    // Filename (discovery) order must equal numeric order, and be strictly
    // increasing -- otherwise the migrate step is order-sensitive to merges.
    assert.deepEqual(numeric, sorted);
    for (let i = 1; i < numeric.length; i++) {
      assert.ok(numeric[i] > numeric[i - 1], 'timestamps must be strictly increasing');
    }
  });
});
