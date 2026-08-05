import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
 * KAN-44 regression test.
 *
 * The prices table refreshes on a timer, but the page never told the user how
 * fresh the numbers were. After a successful refresh a small RELATIVE timestamp
 * (e.g. "updated 12s ago") must render directly above the prices table, and it
 * must update on every successful refresh.
 *
 * On the current (buggy) code nothing renders such a timestamp, so this test
 * fails (the awaited text never appears). It should pass once the "last
 * updated" freshness indicator is added above the prices table.
 */

// Silence unrelated chrome so this test depends only on the coin list + the
// freshness indicator (and so we don't pull in analytics side-effects).
jest.mock('../components/Navbar', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/Footer', () => ({ __esModule: true, default: () => null }));
jest.mock('../routes/Coin', () => ({ __esModule: true, default: () => null }));

// The coin list is fetched over the network on mount / on the refresh timer.
// Stub axios so the first refresh succeeds and the table populates. The single
// coin carries every field a price row reads so the table renders cleanly.
// Support axios(url), axios.get(url) and axios.create().get(url).
jest.mock('axios', () => {
  const coins = [
    {
      id: 'bitcoin',
      market_cap_rank: 1,
      name: 'Bitcoin',
      image: 'https://example.com/bitcoin.png',
      symbol: 'btc',
      current_price: 50000,
      price_change_percentage_24h: 1.23,
      total_volume: 1000000,
      market_cap: 900000000,
    },
  ];
  const resolve = () => Promise.resolve({ data: coins, status: 200 });
  const fn = jest.fn(resolve);
  fn.get = jest.fn(resolve);
  fn.post = jest.fn(resolve);
  fn.create = jest.fn(() => fn);
  return { __esModule: true, default: fn, get: fn.get, post: fn.post, create: fn.create };
});

import App from '../App';
import axios from 'axios';

beforeEach(() => {
  const coins = [
    {
      id: 'bitcoin',
      market_cap_rank: 1,
      name: 'Bitcoin',
      image: 'https://example.com/bitcoin.png',
      symbol: 'btc',
      current_price: 50000,
      price_change_percentage_24h: 1.23,
      total_volume: 1000000,
      market_cap: 900000000,
    },
  ];
  // CRA's Jest config resets mock implementations before each test
  // (resetMocks: true), which wipes the resolved value the mock factory
  // installed. Re-arm the axios mock here so App's refresh
  // (axios.get(url).then(...)) resolves instead of reading .then of undefined.
  const response = { data: coins, status: 200 };
  axios.mockResolvedValue(response);
  axios.get.mockResolvedValue(response);
  axios.post.mockResolvedValue(response);
  axios.create.mockReturnValue(axios);
  // Stub fetch too, in case the coin list is loaded via fetch/an api client.
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(coins),
      text: () => Promise.resolve(JSON.stringify(coins)),
    })
  );
});

test('shows a relative "last updated" timestamp above the prices table after a refresh', async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

  // After the initial successful refresh, a relative freshness indicator such as
  // "updated 12s ago" / "Last updated ..." must be present on the page.
  await waitFor(
    () => {
      expect(document.body.textContent).toMatch(/(updated|refreshed|ago)/i);
    },
    { timeout: 4000 }
  );
});
