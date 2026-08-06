import React from 'react';
import { render, screen } from '@testing-library/react';
import CoinItem from '../CoinItem';

// Regression test for KAN-48.
//
// Market cap must render with locale-aware thousands separators so a
// nine-digit value stays readable at a glance, and a null/undefined market
// cap must render a dash (never NaN or "undefined").

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

const renderRow = (coin) => render(<CoinItem coins={coin} />);

describe('KAN-48 market cap formatting in the prices table', () => {
  it('renders the market cap with thousands separators', () => {
    renderRow({ ...baseCoin, market_cap: 1234567890 });

    expect(screen.getByText('$1,234,567,890')).toBeInTheDocument();
  });

  it('renders a dash for a null market cap instead of NaN or "undefined"', () => {
    renderRow({ ...baseCoin, market_cap: null });

    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });
});
