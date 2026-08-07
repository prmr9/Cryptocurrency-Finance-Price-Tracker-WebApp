'use strict';

// Redaction is a SECURITY boundary, not a formatting nicety: CLAUDE.md's one
// rule is that credentials never reach code, logs, or PRs, and a logger is the
// easiest place in a codebase to break that rule by accident.
//
// These tests exist because the failure is silent. A leaked connection string in
// a log line does not throw, does not fail a build, and is only discovered when
// someone reads the logs — or when someone else does. Each case below is a real
// shape this service can produce: pg errors carry connection URLs, auth errors
// carry tokens, and the wallet feature carries EVM addresses the frontend has
// already promised never to emit.

const test = require('node:test');
const assert = require('node:assert/strict');

const { redact, scrubString, keyIsSensitive, REDACTED } = require('../src/observability/redact');

test('sensitive keys are redacted regardless of their value', () => {
  const out = redact({
    password: 'hunter2',
    DB_PASSWORD: 'hunter2',
    accessToken: 'abc123',
    authorization: 'Basic dXNlcjpwYXNz',
    cookie: 'session=xyz',
    connection_string: 'postgres://u:p@h/db',
    api_key: 'k-123',
    // Not sensitive: these must survive, or the logs become useless.
    email: 'user@example.com',
    user_id: 42,
    route: '/portfolios',
  });

  for (const key of ['password', 'DB_PASSWORD', 'accessToken', 'authorization', 'cookie', 'connection_string', 'api_key']) {
    assert.equal(out[key], REDACTED, `${key} must be redacted`);
  }

  assert.equal(out.user_id, 42);
  assert.equal(out.route, '/portfolios');
});

test('key matching is case-insensitive and substring-based', () => {
  assert.ok(keyIsSensitive('JWT_SECRET'));
  assert.ok(keyIsSensitive('refreshToken'));
  assert.ok(keyIsSensitive('x-api-key'.replace('-key', 'apikey')));
  assert.ok(!keyIsSensitive('username'));
  assert.ok(!keyIsSensitive('duration_ms'));
});

test('a postgres URL inside free text is scrubbed — the key deny-list cannot catch this', () => {
  // The exact shape a `pg` connection error produces. There is no key to match
  // on; only the value pattern layer catches it.
  const message = 'connect ECONNREFUSED postgres://app_admin:s3cr3t@db.internal:5432/cryptotracker';
  const out = scrubString(message);

  assert.ok(!out.includes('s3cr3t'), 'the password must not survive');
  assert.ok(!out.includes('app_admin'), 'the username must not survive');
  assert.match(out, /\[redacted:pg-url\]/);
});

test('a JWT in free text is scrubbed', () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const out = scrubString(`token verification failed for ${token}`);

  assert.ok(!out.includes(token));
  assert.match(out, /\[redacted:jwt\]/);
});

test('an EVM wallet address never reaches a sink', () => {
  // The frontend contract (src/services/analytics.js) is that raw addresses are
  // never emitted. The backend holds the same line, so a log line cannot become
  // the leak the frontend refused to be.
  const out = scrubString('holdings lookup failed for 0x742d35Cc6634C0532925a3b844Bc454e4438f44e');

  assert.ok(!out.includes('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'));
  assert.match(out, /\[redacted:evm-address\]/);
});

test('AWS keys and bearer tokens are scrubbed', () => {
  assert.match(scrubString('using AKIAIOSFODNN7EXAMPLE'), /\[redacted:aws-key\]/);
  assert.match(scrubString('header: Bearer abc.def-ghi_jkl'), /Bearer \[redacted\]/);
});

test('an Error is serialised with message and stack — a plain spread yields {}', () => {
  // message/stack are non-enumerable, so `{...err}` loses everything. This is
  // the single most common way an error log ends up empty.
  const err = new Error('connect failed: postgres://u:p@h:5432/db');
  err.code = 'ECONNREFUSED';

  const out = redact({ error: err });

  assert.equal(out.error.name, 'Error');
  assert.equal(out.error.code, 'ECONNREFUSED');
  assert.ok(out.error.message.includes('[redacted:pg-url]'), 'the message must be scrubbed');
  assert.ok(!out.error.message.includes('u:p@h'), 'credentials must not survive in the message');
  // The stack embeds the message on its first line, so it needs scrubbing too.
  assert.ok(!out.error.stack.includes('u:p@h'), 'credentials must not survive in the stack');
});

test('a circular structure is handled instead of blowing the stack', () => {
  const node = { name: 'a' };
  node.self = node;

  const out = redact({ node });

  assert.equal(out.node.name, 'a');
  assert.equal(out.node.self, '[circular]');
});

test('depth, breadth and string length are bounded so logging cannot become the slow path', () => {
  let deep = { value: 'bottom' };
  for (let i = 0; i < 20; i += 1) deep = { nested: deep };
  assert.ok(JSON.stringify(redact(deep)).includes('[depth-limit]'));

  const wide = redact(new Array(100).fill('x'));
  assert.ok(wide.length < 100, 'a long array must be truncated');
  assert.match(wide[wide.length - 1], /\[\+\d+ more\]/);

  const long = scrubString('x'.repeat(10000));
  assert.ok(long.length < 5000, 'a long string must be truncated');
  assert.match(long, /\[truncated\]/);
});

test('redaction never throws, whatever it is handed', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'boom', {
    enumerable: true,
    get() {
      throw new Error('getter exploded');
    },
  });

  // A throwing getter must not turn a logged error into an unhandled one. The
  // logger catches at its own boundary too, but redact() being total is the
  // cheaper guarantee.
  assert.doesNotThrow(() => {
    try {
      redact(hostile);
    } catch (err) {
      throw new Error(`redact threw: ${err.message}`);
    }
  });

  assert.doesNotThrow(() => redact(undefined));
  assert.doesNotThrow(() => redact(null));
  assert.doesNotThrow(() => redact(Symbol('s')));
  assert.doesNotThrow(() => redact(10n));
});

test('the logger applies redaction — a call site cannot opt out', () => {
  const { createLogger, setSinksForTest, resetLoggerForTest } = require('../src/observability/logger');

  const captured = [];
  setSinksForTest([{ name: 'capture', write: (r) => captured.push(r), flush: () => Promise.resolve() }]);

  try {
    createLogger().info('login attempt', { password: 'hunter2', note: 'postgres://u:p@h/db' });

    assert.equal(captured[0].password, REDACTED);
    assert.ok(!JSON.stringify(captured[0]).includes('hunter2'));
    assert.ok(!JSON.stringify(captured[0]).includes('u:p@h'));
  } finally {
    resetLoggerForTest();
  }
});

test('a broken sink cannot take down the caller', () => {
  const { createLogger, setSinksForTest, resetLoggerForTest } = require('../src/observability/logger');

  const captured = [];
  setSinksForTest([
    { name: 'broken', write: () => { throw new Error('sink exploded'); }, flush: () => Promise.resolve() },
    { name: 'working', write: (r) => captured.push(r), flush: () => Promise.resolve() },
  ]);

  try {
    // One broken sink must not stop the others, and must never take down the
    // request it is describing.
    assert.doesNotThrow(() => createLogger().error('still works'));
    assert.equal(captured.length, 1, 'the healthy sink must still receive the record');
  } finally {
    resetLoggerForTest();
  }
});
