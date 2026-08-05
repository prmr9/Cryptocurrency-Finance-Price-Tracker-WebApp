/**
 * KAN-49 [Metrics] — Instrument the change shipped in KAN-48.
 *
 * KAN-48 formats and guards the prices-table market-cap cell in
 * src/components/CoinItem.js. KAN-49 adds the human-approved analytics
 * instrumentation around that surface: per the approved plan, viewing the
 * KAN-48 entry point must emit the `kan_48_viewed` (engagement) event when the
 * market-cap cell renders.
 *
 * Regression intent: on the CURRENT code no instrumentation exists, so
 * rendering CoinItem emits no analytics event and this test FAILS. Once the
 * `track('kan_48_viewed', { ... })` call is added to CoinItem it PASSES.
 *
 * The analytics module is mocked so the assertion observes the call with no
 * real vendor/network side effect. The mock is shape-agnostic (named export,
 * object default, callable default) so any idiomatic import style used by the
 * implementation is captured.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as analytics from '../../services/analytics';
import CoinItem from '../CoinItem';

jest.mock('../../services/analytics', () => {
  const track = jest.fn();
  track.track = track;
  return { __esModule: true, track, default: track };
});

const coin = {
  id: 'bitcoin',
  market_cap_rank: 1,
  name: 'Bitcoin',
  symbol: 'btc',
  image: 'https://assets.example/btc.png',
  current_price: 50000,
  price_change_percentage_24h: 2.5,
  total_volume: 30000000000,
  market_cap: 1000000000000,
};

beforeEach(() => {
  analytics.track.mockClear();
});

test('KAN-49: rendering the CoinItem market-cap surface emits the kan_48_viewed analytics event', () => {
  render(
    <MemoryRouter>
      <CoinItem coins={coin} />
    </MemoryRouter>
  );

  const viewedCalls = analytics.track.mock.calls.filter(
    ([event]) => event === 'kan_48_viewed'
  );

  // Fails on current code (no instrumentation); passes once KAN-49 adds the call.
  expect(viewedCalls.length).toBeGreaterThan(0);

  // A metrics event must carry a properties payload (per the approved plan).
  const [, payload] = viewedCalls[0] || [];
  expect(payload).toEqual(expect.any(Object));
});
