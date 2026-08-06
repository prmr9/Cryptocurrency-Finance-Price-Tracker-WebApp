import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Coins from '../Coins';

// Regression test for KAN-54.
//
// The market table must show the time of the last successful fetch so a stale
// price is distinguishable from a live one. Before any successful fetch has
// completed (lastUpdated is null / absent), no timestamp — and no placeholder
// time — may be rendered.

// Presentational children are irrelevant to the timestamp seam; stub them out.
jest.mock('../CoinItem', () => () => <div data-testid='coin-item' />);
jest.mock('../../routes/Coin', () => () => <div data-testid='coin-route' />);

const renderCoins = (props) =>
  render(
    <MemoryRouter>
      <Coins coins={[]} {...props} />
    </MemoryRouter>
  );

describe('KAN-54 last-updated timestamp on the market table', () => {
  it('renders the fetch time once a successful fetch has completed', () => {
    const lastUpdated = new Date('2020-01-01T14:32:07');

    renderCoins({ lastUpdated });

    expect(screen.getByText(/Updated/)).toHaveClass('last-updated');
    expect(
      screen.getByText(new RegExp(lastUpdated.toLocaleTimeString()))
    ).toBeInTheDocument();
  });

  it('renders no timestamp before any successful fetch (lastUpdated=null)', () => {
    renderCoins({ lastUpdated: null });

    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it('renders no timestamp when the lastUpdated prop is omitted', () => {
    renderCoins({});

    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });
});
