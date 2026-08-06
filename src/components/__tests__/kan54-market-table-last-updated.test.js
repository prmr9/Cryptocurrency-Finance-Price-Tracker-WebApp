// Regression test for KAN-54: the market table must indicate how fresh its
// numbers are by showing the time of the last successful CoinGecko fetch.
//
// App.js records the time of a successful fetch and passes it down to Coins,
// which renders it near the top of the market table (e.g. "Updated 14:32:07").
// Before any successful fetch has completed, no timestamp (and no placeholder)
// is shown.
//
// On the pre-fix code, Coins renders no timestamp at all, so the first test
// below fails. Once Coins renders the passed-in fetch time, it passes.

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Coins from '../Coins';

function renderCoins(props) {
  return render(
    <MemoryRouter>
      <Coins coins={[]} {...props} />
    </MemoryRouter>
  );
}

describe('KAN-54: market table shows when prices were last updated', () => {
  test('renders the time of a successful fetch passed down from App', () => {
    // A concrete, unambiguous local time. The exact locale format is left to
    // the implementation, so we assert the label plus a HH:MM:SS time token
    // rather than a specific string.
    const lastUpdated = new Date(2026, 7, 6, 14, 32, 7);

    renderCoins({ lastUpdated });

    expect(
      screen.getByText(/Updated\s+\d{1,2}:\d{2}:\d{2}/i)
    ).toBeInTheDocument();
  });

  test('shows no timestamp before any successful fetch has completed', () => {
    // No fetch yet: App has not recorded a time, so nothing is passed down.
    renderCoins({ lastUpdated: null });

    expect(screen.queryByText(/Updated/i)).not.toBeInTheDocument();
    // And no placeholder / guessed time either.
    expect(screen.queryByText(/\d{1,2}:\d{2}:\d{2}/)).not.toBeInTheDocument();
  });
});
