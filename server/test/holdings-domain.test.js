'use strict';

// Unit tests for mergeHoldings (KAN-15 / contracts C15, C16).

const test = require('node:test');
const assert = require('node:assert');

const { mergeHoldings } = require('../src/domain/holdings');

test('mergeHoldings: empty/missing incoming returns existing unchanged (no data loss)', () => {
  const existing = [{ symbol: 'BTC', shares: 1 }];
  assert.deepEqual(mergeHoldings(existing, []), existing);
  assert.deepEqual(mergeHoldings(existing, undefined), existing);
  assert.deepEqual(mergeHoldings(existing, null), existing);
});

test('mergeHoldings: incoming entries overwrite matching symbols', () => {
  const existing = [{ symbol: 'BTC', shares: 1 }];
  const incoming = [{ symbol: 'BTC', shares: 5 }];
  const merged = mergeHoldings(existing, incoming);
  assert.deepEqual(merged, [{ symbol: 'BTC', shares: 5 }]);
});

test('mergeHoldings: existing entries absent from incoming are preserved untouched', () => {
  const existing = [
    { symbol: 'BTC', shares: 1 },
    { symbol: 'ETH', shares: 2 },
  ];
  const incoming = [{ symbol: 'SOL', shares: 3 }];
  const merged = mergeHoldings(existing, incoming);
  const bySymbol = Object.fromEntries(merged.map((h) => [h.symbol, h.shares]));
  assert.deepEqual(bySymbol, { BTC: 1, ETH: 2, SOL: 3 });
});

test('mergeHoldings: empty existing with incoming just returns incoming (union)', () => {
  const incoming = [{ symbol: 'BTC', shares: 1 }];
  assert.deepEqual(mergeHoldings([], incoming), incoming);
  assert.deepEqual(mergeHoldings(undefined, incoming), incoming);
});
