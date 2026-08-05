import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CoinItem from '../CoinItem';

// Regression test for KAN-48.
//
// The prices table renders market cap as a raw integer, so a nine-digit value
// is unreadable at a glance. Market cap must be formatted with locale-aware
// thousands separators, and a null/undefined market cap must render a dash
// (never NaN or "undefined").

const baseCoin = {
  id: 'bitcoin',
  rank: 1,
  name: 'Bitcoin',
  symbol: 'btc',
  image: 'https://example.com/bitcoin.png',
  current_price: 50000,
  price_change_percentage_24h: 2.34,
  total_volume: 987654321,
  market_cap: 1234567890,
};

const renderRow = (coin) =>
  render(
    <MemoryRouter>
      <CoinItem coins={coin} />
    </MemoryRouter>
  );

describe('KAN-48 market cap formatting in the prices table', () => {
  it('renders the market cap with thousands separators', () => {
    const { container } = renderRow({ ...baseCoin, market_cap: 1234567890 });

    // The buggy component renders the raw integer "1234567890" (no
    // separators), so this assertion fails until the value is formatted.
    expect(container.textContent).toContain('1,234,567,890');
  });

  it('renders a dash for a null market cap instead of NaN or "undefined"', () => {
    const { container } = renderRow({ ...baseCoin, market_cap: null });

    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('undefined');
  });
});
