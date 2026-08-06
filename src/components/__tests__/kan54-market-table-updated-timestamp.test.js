import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Coins from '../Coins';

// KAN-54: The market table must show when its prices were last successfully
// fetched. App.js records the time of a successful CoinGecko fetch and passes
// it to Coins, which renders it near the top of the table (e.g. "Updated
// 14:32:07"). Before any successful fetch, nothing is shown.

const sampleCoins = [
  {
    id: 'bitcoin',
    rank: 1,
    name: 'Bitcoin',
    symbol: 'btc',
    image: 'https://example.com/btc.png',
    current_price: 50000,
    price_change_percentage_24h: 1.5,
    total_volume: 1000000,
    market_cap: 900000000000,
  },
];

describe('KAN-54 market table last-updated timestamp', () => {
  test('renders the time of the last successful fetch when provided', () => {
    const lastUpdated = new Date('2026-08-06T14:32:07');

    render(
      <MemoryRouter>
        <Coins coins={sampleCoins} lastUpdated={lastUpdated} />
      </MemoryRouter>
    );

    // The bug: nothing anywhere renders a timestamp for the fetch, so an
    // "updated" indicator is completely absent on the current code. This
    // assertion therefore FAILS on the buggy code and passes once Coins
    // renders the passed-in timestamp.
    const indicator = screen.getByText(/updated/i);
    expect(indicator).toBeInTheDocument();

    // And it must actually surface the fetch time, not just the word.
    const expectedTime = lastUpdated.toLocaleTimeString();
    expect(indicator.textContent).toEqual(expect.stringContaining(expectedTime));
  });

  test('shows no timestamp before any successful fetch has completed', () => {
    render(
      <MemoryRouter>
        <Coins coins={sampleCoins} lastUpdated={null} />
      </MemoryRouter>
    );

    expect(screen.queryByText(/updated/i)).toBeNull();
  });
});
