'use strict';

// getJwtSecret provenance + validation (KAN-13 / contract C9, AC 5).
//
// Asserts the signing key is read from JWT_SECRET (env) with NO default fallback
// and is REJECTED when absent or shorter than the required 32 chars.

const test = require('node:test');
const assert = require('node:assert');

const { getJwtSecret, MIN_SECRET_LENGTH } = require('../src/auth/config');

function withJwtEnv(value, fn) {
  const prev = process.env.JWT_SECRET;
  const prevName = process.env.JWT_SECRET_NAME;
  delete process.env.JWT_SECRET_NAME; // force the env path, not Secrets Manager
  if (value === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prev;
      if (prevName === undefined) delete process.env.JWT_SECRET_NAME;
      else process.env.JWT_SECRET_NAME = prevName;
    });
}

test('getJwtSecret throws when JWT_SECRET is absent (no default fallback)', () =>
  withJwtEnv(undefined, async () => {
    await assert.rejects(getJwtSecret(), /not configured|no default/i);
  }));

test('getJwtSecret throws when the secret is shorter than the minimum', () =>
  withJwtEnv('short', async () => {
    await assert.rejects(getJwtSecret(), /too short/i);
  }));

test('getJwtSecret returns a valid >=32 char secret', () =>
  withJwtEnv('x'.repeat(MIN_SECRET_LENGTH), async () => {
    const secret = await getJwtSecret();
    assert.equal(secret.length, MIN_SECRET_LENGTH);
  }));

test('the minimum secret length is at least 32 characters', () => {
  assert.ok(MIN_SECRET_LENGTH >= 32);
});
