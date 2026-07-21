'use strict';

// Migration discovery test (KAN-11 / contract C5). node-pg-migrate applies
// every file it finds in the migrations dir as a migration; migrate.js sets
// `ignorePattern` so the co-located *.test.js unit test is skipped while the
// real migration is still discovered. This guards the acceptance criterion that
// pending repo-stored migrations are applied (and re-runs skip already-applied
// ones via the pgmigrations table) — a stray test file loaded as a migration
// would break that.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { loadMigrationFiles } = require('node-pg-migrate/dist/migration');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
// Keep this in lockstep with the ignorePattern configured in migrate.js.
const IGNORE_PATTERN = '.*\\.test\\.js';

test('migrate.js configures the same ignorePattern this test asserts on', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'migrate.js'), 'utf8');
  assert.match(src, /ignorePattern:\s*'\.\*\\\\\.test\\\\\.js'/);
});

test('the runner discovers the real migration and excludes the co-located test', async () => {
  const files = await loadMigrationFiles(MIGRATIONS_DIR, IGNORE_PATTERN);
  assert.ok(
    files.includes('1700000000000_bootstrap-migration-tracking.js'),
    'the real migration must be discovered'
  );
  assert.ok(
    !files.some((f) => f.endsWith('.test.js')),
    'no *.test.js file may be treated as a migration'
  );
});
