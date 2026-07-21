'use strict';

// Contract/shape tests for KAN-13 (C4 + C9). Mirrors the source-grep style of
// tls-and-config.test.js for invariants that are best asserted structurally:
//   * package.json declares express/jsonwebtoken/cookie-parser + a node --test
//     "test" script, with the lockfile pinning the same versions (AC 1);
//   * the revoked_sessions migration has the required shape and a matching down
//     (AC 6);
//   * no new DB access disables TLS verification (AC 8);
//   * app.js/index.js wire the health route, the sweep timer, and the fail-fast
//     boot assertion (AC 2/5).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(SERVER_DIR, p), 'utf8');

// --- AC 1: server dependencies + test script -------------------------------

test('package.json declares express, jsonwebtoken, cookie-parser and a node --test test script', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['express', 'jsonwebtoken', 'cookie-parser']) {
    assert.ok(pkg.dependencies[dep], `dependency ${dep} must be declared`);
  }
  assert.match(pkg.scripts.test, /node --test/);
  assert.equal(pkg.scripts.start, 'node src/index.js');
});

test('package-lock.json pins express, jsonwebtoken and cookie-parser (npm ci works)', () => {
  const lock = read('package-lock.json');
  for (const dep of ['express', 'jsonwebtoken', 'cookie-parser']) {
    assert.match(lock, new RegExp(`node_modules/${dep}`), `${dep} must be in the lockfile`);
  }
});

// --- AC 6: revoked_sessions migration shape --------------------------------

// Recording pgm proxy (same technique the KAN-12 migration test uses).
function makeRecordingPgm() {
  const calls = [];
  const handler = {
    get(_t, prop) {
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

test('migration up() creates revoked_sessions with jti PK, user_id, expires_at, revoked_at', () => {
  const migration = require('../migrations/1720000000000_auth-sessions');
  assert.equal(typeof migration.up, 'function');
  assert.equal(typeof migration.down, 'function');

  const { pgm, calls } = makeRecordingPgm();
  migration.up(pgm);
  const create = calls.find((c) => c.method === 'createTable' && c.args[0] === 'revoked_sessions');
  assert.ok(create, 'must create revoked_sessions');
  const cols = create.args[1];
  assert.equal(cols.jti.primaryKey, true);
  assert.ok(cols.user_id, 'user_id column present');
  assert.ok(cols.expires_at, 'expires_at column present');
  assert.ok(cols.revoked_at, 'revoked_at column present');
});

test('migration down() drops revoked_sessions', () => {
  const migration = require('../migrations/1720000000000_auth-sessions');
  const { pgm, calls } = makeRecordingPgm();
  migration.down(pgm);
  const dropped = calls.filter((c) => c.method === 'dropTable').map((c) => c.args[0]);
  assert.deepEqual(dropped, ['revoked_sessions']);
});

test('the revoked_sessions migration contains no CREATE EXTENSION (keeps tls-and-config.test.js green)', () => {
  const src = read('migrations/1720000000000_auth-sessions.js');
  assert.doesNotMatch(src, /create\s+extension/i);
});

// --- AC 8: TLS verification never disabled in new code ----------------------

test('no new server source disables TLS verification (rejectUnauthorized:false)', () => {
  const files = [
    'src/app.js',
    'src/index.js',
    'src/routes/health.js',
    'src/auth/config.js',
    'src/auth/session.js',
  ];
  for (const f of files) {
    assert.doesNotMatch(read(f), /rejectUnauthorized:\s*false/, `${f} must not disable TLS`);
  }
});

// --- AC 2/5: wiring in app.js and index.js ----------------------------------

test('app.js mounts cookie-parser and the GET /health route and starts the sweep timer', () => {
  const src = read('src/app.js');
  assert.match(src, /cookie-parser|cookieParser/);
  assert.match(src, /get\(\s*['"]\/health['"]/);
  assert.match(src, /setInterval\(\s*sweepDenylist/);
  assert.match(src, /\.unref\(\)/);
  // The sweep timer must have a teardown path so it is never leaked.
  assert.match(src, /clearInterval/);
});

test('closeApp() clears the denylist sweep timer (no leaked interval)', () => {
  const { createApp, closeApp } = require('../src/app');
  const app = createApp();
  assert.equal(typeof closeApp, 'function');
  assert.ok(app.locals.sweepTimer, 'sweep timer is created');
  // Must not throw and must clear the interval; also idempotent.
  closeApp(app);
  closeApp(app);
});

test('index.js awaits getJwtSecret before listen() (fail-fast boot)', () => {
  const src = read('src/index.js');
  const boot = src.indexOf('getJwtSecret');
  const listen = src.indexOf('listen(');
  assert.ok(boot !== -1 && listen !== -1, 'both getJwtSecret and listen must appear');
  assert.ok(boot < listen, 'getJwtSecret must be awaited before listen()');
});
