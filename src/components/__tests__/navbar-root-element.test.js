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
  test('renders the title heading alongside exactly three links', () => {
    renderNavbar();

    expect(
      screen.getByRole('heading', { level: 1, name: /cryptotracker/i })
    ).toBeInTheDocument();
    // title link + Prices + Watchlist + About + Trade anchor
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  test('renders an Accounts link pointing at the /accounts route', () => {
    renderNavbar();

    expect(screen.getByRole('link', { name: /watchlist/i })).toHaveAttribute(
      'href',
      '/accounts'
    );
  });

  test('the Trade link opens the trading platform safely in a new tab', () => {
    renderNavbar();

    const trade = screen.getByRole('link', { name: /trade/i });

    expect(trade).toHaveAttribute('target', '_blank');
    expect(trade).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
