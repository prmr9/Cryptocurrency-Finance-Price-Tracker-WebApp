'use strict';

// Unit tests for validatePortfolioName / validateHoldings (KAN-15 / contracts
// C14-C16).

const test = require('node:test');
const assert = require('node:assert');

const {
  ValidationError,
  ALLOWED_PORTFOLIO_NAMES,
  validatePortfolioName,
  validateHoldings,
} = require('../src/validation/holdings');

test('ALLOWED_PORTFOLIO_NAMES is exactly default/watchlist', () => {
  assert.deepEqual(ALLOWED_PORTFOLIO_NAMES, ['default', 'watchlist']);
});

test('validatePortfolioName accepts every allowlisted name', () => {
  for (const name of ALLOWED_PORTFOLIO_NAMES) {
    assert.doesNotThrow(() => validatePortfolioName(name));
  }
});

test('validatePortfolioName rejects an arbitrary client-supplied name', () => {
  assert.throws(() => validatePortfolioName('anything-else'), ValidationError);
  assert.throws(() => validatePortfolioName(''), ValidationError);
  assert.throws(() => validatePortfolioName(undefined), ValidationError);
});

test('validateHoldings accepts a well-shaped array', () => {
  assert.doesNotThrow(() =>
    validateHoldings([
      { symbol: 'BTC', shares: 1.5 },
      { symbol: 'ETH', shares: 0 },
    ])
  );
});

test('validateHoldings rejects a non-array payload', () => {
  assert.throws(() => validateHoldings({ symbol: 'BTC', shares: 1 }), ValidationError);
  assert.throws(() => validateHoldings('not-an-array'), ValidationError);
  assert.throws(() => validateHoldings(null), ValidationError);
});

test('validateHoldings rejects an entry with a non-string / empty / overlong symbol', () => {
  assert.throws(() => validateHoldings([{ symbol: 123, shares: 1 }]), ValidationError);
  assert.throws(() => validateHoldings([{ symbol: '', shares: 1 }]), ValidationError);
  assert.throws(() => validateHoldings([{ symbol: 'A'.repeat(11), shares: 1 }]), ValidationError);
});

test('validateHoldings rejects an entry with a non-finite or negative shares', () => {
  assert.throws(() => validateHoldings([{ symbol: 'BTC', shares: '1' }]), ValidationError);
  assert.throws(() => validateHoldings([{ symbol: 'BTC', shares: -1 }]), ValidationError);
  assert.throws(() => validateHoldings([{ symbol: 'BTC', shares: Infinity }]), ValidationError);
  assert.throws(() => validateHoldings([{ symbol: 'BTC', shares: NaN }]), ValidationError);
});

test('validateHoldings rejects more than 500 entries', () => {
  const tooMany = Array.from({ length: 501 }, (_, i) => ({ symbol: `S${i}`, shares: 1 }));
  assert.throws(() => validateHoldings(tooMany), ValidationError);
});

test('validateHoldings accepts exactly 500 entries', () => {
  const exactly500 = Array.from({ length: 500 }, (_, i) => ({ symbol: `S${i}`.slice(0, 10), shares: 1 }));
  assert.doesNotThrow(() => validateHoldings(exactly500));
});

test('validateHoldings rejects a payload exceeding the byte-size cap', () => {
  const huge = Array.from({ length: 500 }, (_, i) => ({ symbol: `S${i % 10}`, shares: i, note: 'x'.repeat(200) }));
  assert.throws(() => validateHoldings(huge), ValidationError);
});
