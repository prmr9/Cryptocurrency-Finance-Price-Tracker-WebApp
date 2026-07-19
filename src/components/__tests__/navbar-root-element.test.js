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
  test('renders the title heading alongside exactly two links', () => {
    renderNavbar();

    expect(
      screen.getByRole('heading', { level: 1, name: /coin search/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  test('the Trade link opens the trading platform safely in a new tab', () => {
    renderNavbar();

    const trade = screen.getByRole('link', { name: /trade/i });

    expect(trade).toHaveAttribute('target', '_blank');
    expect(trade).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
