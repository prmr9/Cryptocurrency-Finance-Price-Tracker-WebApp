import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

describe('Navbar root element', () => {
  test('renders the CryptoTracker title heading alongside the nav + CTA links', () => {
    renderNavbar();

    expect(
      screen.getByRole('heading', { level: 1, name: /cryptotracker/i })
    ).toBeInTheDocument();
    // title link + Prices + Watchlist + About + Trade anchor
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  test('renders a Watchlist link pointing at the /accounts route', () => {
    renderNavbar();

    expect(screen.getByRole('link', { name: /watchlist/i })).toHaveAttribute(
      'href',
      '/accounts'
    );
  });

  test('renders an About link pointing at the /about route', () => {
    renderNavbar();

    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute(
      'href',
      '/about'
    );
  });

  test('the Trade link opens the trading platform safely in a new tab', () => {
    renderNavbar();

    const trade = screen.getByRole('link', { name: /trade/i });

    expect(trade).toHaveAttribute('target', '_blank');
    expect(trade).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
