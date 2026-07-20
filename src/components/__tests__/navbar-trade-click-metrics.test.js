import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { track } from '../../services/analytics';
import { TRADE_URL } from '../../services/uniswap';
import Navbar from '../Navbar';

// --- KAN-5 metrics regression -------------------------------------------------
// KAN-4 re-pointed the Navbar "Trade" anchor at the shared TRADEURL constant.
// KAN-5 must INSTRUMENT a click on that anchor by emitting a `trade_link_clicked`
// analytics event whose `destination_url` equals TRADEURL.
//
// Reproduces the bug: on the current (un-instrumented) code Navbar never calls
// track(), so the click emits no event and this test FAILS. Once KAN-5 wires the
// analytics call into the Trade anchor's click handler, it PASSES.
//
// The analytics module is the surface KAN-5 introduces; the test mocks it so the
// emitted event can be observed without a real vendor.
jest.mock('../../services/analytics', () => ({
  track: jest.fn(),
  noteInAppNavigation: jest.fn(),
  flushAnalytics: jest.fn()
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('clicking the Navbar Trade link emits trade_link_clicked with the Uniswap destination_url', () => {
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

  const tradeLink = screen.getByRole('link', { name: /trade/i });

  // KAN-4 behaviour (context, not the bug under test): the anchor targets the
  // shared TRADEURL constant.
  expect(tradeLink.getAttribute('href')).toBe(TRADE_URL);

  // Stop jsdom from attempting a real navigation on click. This only cancels the
  // browser's default action; it does not stop React's onClick handler, so it
  // does not affect whether the instrumentation fires.
  tradeLink.addEventListener('click', (e) => e.preventDefault());

  fireEvent.click(tradeLink);

  // KAN-5 behaviour under test: the click MUST be instrumented. This is the
  // assertion the current code violates.
  expect(track).toHaveBeenCalledWith(
    'trade_link_clicked',
    expect.objectContaining({ destination_url: TRADE_URL })
  );
});
