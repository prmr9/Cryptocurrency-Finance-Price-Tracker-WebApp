import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Coins from '../Coins';

/*
 * Regression test for KAN-44:
 * "Show a 'Last updated' timestamp above the prices table".
 *
 * The prices table refreshes on a timer but never tells the user how fresh
 * the numbers are. A relative-time "last updated" indicator must render
 * together with (and directly above) the prices table, and it must read as
 * relative time such as "updated 12s ago".
 *
 * On the current (buggy) code no such indicator exists, so this test fails.
 * Once the timestamp is added it passes.
 */

const mockCoins = [
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'btc',
    image: 'https://example.com/bitcoin.png',
    current_price: 50000,
    market_cap: 900000000000,
    market_cap_rank: 1,
    total_volume: 30000000000,
    price_change_percentage_24h: 1.23,
    high_24h: 51000,
    low_24h: 49000,
    circulating_supply: 19000000,
    total_supply: 21000000,
    ath: 69000,
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'eth',
    image: 'https://example.com/ethereum.png',
    current_price: 3000,
    market_cap: 400000000000,
    market_cap_rank: 2,
    total_volume: 15000000000,
    price_change_percentage_24h: -0.45,
    high_24h: 3100,
    low_24h: 2900,
    circulating_supply: 120000000,
    total_supply: 120000000,
    ath: 4800,
  },
];

describe('KAN-44: last updated timestamp above the prices table', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Cover implementations where the prices table fetches on its own: a
    // successful refresh must record a "last updated" time.
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockCoins),
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('shows a relative "updated ... ago" timestamp with the prices table', async () => {
    // Pretend the most recent successful refresh happened ~12s ago.
    // Implementations that read the last-updated time from a prop will render
    // "updated 12s ago"; unused candidate prop names are harmless.
    const twelveSecondsAgo = new Date(Date.now() - 12000);
    const timeProps = {
      lastUpdated: twelveSecondsAgo,
      lastUpdatedAt: twelveSecondsAgo,
      updatedAt: twelveSecondsAgo,
      lastRefreshed: twelveSecondsAgo,
      lastRefreshedAt: twelveSecondsAgo,
      lastSuccessfulUpdate: twelveSecondsAgo,
    };

    const { container } = render(
      <MemoryRouter>
        <Coins coins={mockCoins} {...timeProps} />
      </MemoryRouter>
    );

    // The timestamp must be present and read as relative time.
    await waitFor(() => {
      const text = container.textContent || '';
      expect(text).toMatch(/(updated|refreshed)/i);
      expect(text).toMatch(/(ago|just now)/i);
    });

    // ...and it must sit above the prices table (before the first coin row).
    const text = container.textContent || '';
    const firstCoinIndex = text.indexOf('Bitcoin');
    if (firstCoinIndex !== -1) {
      const labelIndex = text.search(/(last\s+)?(updated|refreshed)/i);
      expect(labelIndex).toBeGreaterThanOrEqual(0);
      expect(labelIndex).toBeLessThan(firstCoinIndex);
    }
  });
});
