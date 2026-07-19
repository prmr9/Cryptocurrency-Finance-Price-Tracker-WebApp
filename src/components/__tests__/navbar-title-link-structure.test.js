import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

describe('Navbar title Link structure', () => {
  test('the title link points at the root route and holds the h1 title', () => {
    renderNavbar();

    const titleLink = screen.getByRole('link', { name: /coin search/i });

    expect(titleLink).toHaveAttribute('href', '/');
    expect(
      within(titleLink).getByRole('heading', { level: 1 })
    ).toBeInTheDocument();
    expect(within(titleLink).queryAllByRole('link')).toHaveLength(0);
  });

  test('the Trade anchor is a sibling of the title link, not nested in it', () => {
    renderNavbar();

    const titleLink = screen.getByRole('link', { name: /coin search/i });
    const trade = screen.getByRole('link', { name: /trade/i });

    expect(within(titleLink).queryByRole('link', { name: /trade/i })).toBeNull();
    expect(trade).toHaveAttribute('href', 'https://app.uniswap.org');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
