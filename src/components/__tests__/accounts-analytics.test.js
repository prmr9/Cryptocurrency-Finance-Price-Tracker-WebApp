import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// KAN-5: every onboarding event is routed through the shared `track` helper in
// src/services/analytics.js, so asserting on that one seam covers the whole
// funnel without reaching into the sink.
// Only `track` is stubbed: the components also import touchSession,
// resolveEntrySource, notePreexistingAccounts, getRetentionContext,
// noteInAppNavigation and flushAnalytics from this module, so the real
// implementations are kept rather than replaced with undefined.
jest.mock('../../services/analytics', () => ({
  ...jest.requireActual('../../services/analytics'),
  __esModule: true,
  track: jest.fn(),
}));

// eslint-disable-next-line import/first
import { track } from '../../services/analytics';
// eslint-disable-next-line import/first
import Accounts from '../Accounts';
// eslint-disable-next-line import/first
import Navbar from '../Navbar';
// eslint-disable-next-line import/first
import { TRADE_URL } from '../../services/uniswap';

const callsFor = (eventName) =>
  track.mock.calls.filter(([name]) => name === eventName);

const propsFor = (eventName) => {
  const calls = callsFor(eventName);
  return calls.length ? calls[calls.length - 1][1] : undefined;
};

beforeEach(() => {
  window.localStorage.clear();
  track.mockClear();
});

describe('KAN-5 accounts onboarding instrumentation', () => {
  test('mounting the /accounts view emits accounts_view_opened', async () => {
    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Accounts />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(callsFor('accounts_view_opened')).toHaveLength(1);
    });

    expect(propsFor('accounts_view_opened')).toEqual(
      expect.objectContaining({
        entry_source: expect.anything(),
        existing_account_count: 0,
        is_first_visit: expect.any(Boolean),
      })
    );
  });

  test('clicking the Navbar Trade anchor emits trade_link_clicked', async () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    const tradeLink = screen.getByRole('link', { name: /trade/i });
    expect(tradeLink).toHaveAttribute('href', TRADE_URL);

    fireEvent.click(tradeLink);

    await waitFor(() => {
      expect(callsFor('trade_link_clicked')).toHaveLength(1);
    });

    expect(propsFor('trade_link_clicked')).toEqual(
      expect.objectContaining({
        source: expect.anything(),
        destination_url: TRADE_URL,
      })
    );
  });
});
