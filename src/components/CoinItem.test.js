import { formatMarketCap } from './CoinItem';

// Regression test for KAN-48.
//
// The prices-table market-cap cell crashed the whole row whenever a coin's
// `market_cap` was null/undefined, because CoinItem inlined an UNGUARDED
// `props.coins.market_cap.toLocaleString()` (CoinItem.js:16) and
// `null.toLocaleString()` / `undefined.toLocaleString()` throw a TypeError.
//
// The fix extracts a colocated pure helper `formatMarketCap(value)` that guards
// with `Number.isFinite(value)`: it returns an em dash for non-finite values
// and a thousands-grouped string (via `value.toLocaleString('en-US')`) otherwise.
//
// These assertions FAIL on the current (buggy) code — `formatMarketCap` is not
// exported, so calling it throws — and PASS only once the guarded helper exists.

const EM_DASH = '\u2014';

describe('formatMarketCap (KAN-48 regression)', () => {
  it('returns a dash instead of throwing when market cap is null', () => {
    expect(() => formatMarketCap(null)).not.toThrow();
    expect(formatMarketCap(null)).toBe(EM_DASH);
  });

  it('returns a dash instead of throwing when market cap is undefined', () => {
    expect(() => formatMarketCap(undefined)).not.toThrow();
    expect(formatMarketCap(undefined)).toBe(EM_DASH);
  });

  it('formats a finite market cap with thousands separators', () => {
    expect(formatMarketCap(1234567890)).toContain('1,234,567,890');
  });
});
