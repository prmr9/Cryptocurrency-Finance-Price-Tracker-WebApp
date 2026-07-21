import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';
import { TRADE_URL } from '../../services/uniswap';

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

describe('Navbar title Link structure', () => {
  test('the title link points at the root route and holds the h1 title', () => {
    renderNavbar();

    const titleLink = screen.getByRole('link', { name: /cryptotracker/i });

    expect(titleLink).toHaveAttribute('href', '/');
    expect(
      within(titleLink).getByRole('heading', { level: 1 })
    ).toBeInTheDocument();
    expect(within(titleLink).queryAllByRole('link')).toHaveLength(0);
  });

  test('the Trade anchor is a sibling of the title link, not nested in it', () => {
    renderNavbar();

    const titleLink = screen.getByRole('link', { name: /cryptotracker/i });
    const trade = screen.getByRole('link', { name: /trade/i });

    expect(within(titleLink).queryByRole('link', { name: /trade/i })).toBeNull();
    // asserted against both the shared constant and its literal value, so a
    // silent edit to TRADE_URL cannot make this test vacuously pass
    expect(trade).toHaveAttribute('href', TRADE_URL);
    expect(trade).toHaveAttribute('href', 'https://app.uniswap.org/explore');
    // title link + Prices + Watchlist + About + Trade anchor
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });
});
