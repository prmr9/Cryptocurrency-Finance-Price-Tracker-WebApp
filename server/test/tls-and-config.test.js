'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { getRdsCa, DEFAULT_CA_PATH } = require('../src/db/tls');

const SERVER_DIR = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(SERVER_DIR, p), 'utf8');

test('the pinned RDS CA bundle file exists and getRdsCa reads it', () => {
  assert.ok(fs.existsSync(DEFAULT_CA_PATH), 'rds-global-bundle.pem must exist');
  assert.match(DEFAULT_CA_PATH, /certs[\\/]rds-global-bundle\.pem$/);
  assert.equal(typeof getRdsCa(), 'string');
});

test('pool.js verifies TLS via getRdsCa with rejectUnauthorized true (never false)', () => {
  const src = read('src/db/pool.js');
  assert.match(src, /ca:\s*getRdsCa\(\)/);
  assert.match(src, /rejectUnauthorized:\s*true/);
  assert.doesNotMatch(src, /rejectUnauthorized:\s*false/);
});

test('migrate.js connects to the tunnel host but pins servername to the real RDS host', () => {
  const src = read('migrate.js');
  assert.match(src, /process\.env\.PGHOST\s*\|\|\s*'127\.0\.0\.1'/);
  assert.match(src, /servername:\s*secret\.host/);
  assert.match(src, /ca:\s*getRdsCa\(\)/);
  assert.match(src, /rejectUnauthorized:\s*true/);
  assert.match(src, /migrationsTable:\s*MIGRATIONS_TABLE/);
  assert.match(src, /MIGRATIONS_TABLE\s*=\s*'pgmigrations'/);
});

test('no repo-stored migration contains a CREATE EXTENSION statement', () => {
  const dir = path.join(SERVER_DIR, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 1, 'at least one migration file must exist');
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(sql, /create\s+extension/i, `${f} must not CREATE EXTENSION`);
  }
});
