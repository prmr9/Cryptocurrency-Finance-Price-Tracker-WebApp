/**
 * KAN-44 regression test.
 *
 * Bug: the coin "prices table" (rendered by the coin-detail route) refreshes on
 * a timer, but the page never tells the user how fresh the numbers are. There
 * must be a "last updated" timestamp, shown as relative time (e.g.
 * "updated 12s ago"), directly above the prices table, refreshed on every
 * successful price refresh.
 *
 * This test renders the coin-detail route with a mocked, successful price fetch
 * and asserts that a relative "updated ... ago" timestamp is rendered. It fails
 * on the current code (no such timestamp exists) and passes once the fix is in
 * place. It intentionally asserts on user-visible text rather than internal
 * props, so it holds regardless of how the timestamp is wired up.
 */
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import Coin from './Coin';

jest.mock('axios');

// A realistic (optional-chaining-safe) CoinGecko coin payload so the detail
// route renders its prices table without crashing under either the buggy or the
// fixed implementation.
const coinFixture = {
  id: 'bitcoin',
  name: 'Bitcoin',
  symbol: 'btc',
  hashing_algorithm: 'SHA-256',
  market_cap_rank: 1,
  image: { thumb: '', small: 'https://example.com/btc.png', large: '' },
  description: { en: 'Bitcoin is a decentralized digital currency.' },
  links: {
    homepage: ['https://bitcoin.org'],
    blockchain_site: ['https://blockchair.com/bitcoin'],
    subreddit_url: 'https://reddit.com/r/bitcoin',
  },
  genesis_date: '2009-01-03',
  market_data: {
    current_price: { usd: 50000 },
    ath: { usd: 69000 },
    atl: { usd: 67 },
    market_cap: { usd: 950000000000 },
    market_cap_rank: 1,
    total_volume: { usd: 30000000000 },
    high_24h: { usd: 51000 },
    low_24h: { usd: 49000 },
    price_change_percentage_24h: 2.5,
    price_change_percentage_7d: 5.1,
    price_change_percentage_14d: -1.2,
    price_change_percentage_30d: 10.4,
    price_change_percentage_60d: 20.0,
    price_change_percentage_1y: 120.0,
    circulating_supply: 19000000,
    total_supply: 21000000,
    max_supply: 21000000,
  },
};

// Make every price fetch succeed with the fixture, regardless of whether the
// component fetches via axios.get, the axios default function, or fetch().
function setSuccessfulFetch(data = coinFixture) {
  if (axios && typeof axios.get === 'function' && axios.get.mockResolvedValue) {
    axios.get.mockResolvedValue({ data });
  }
  if (typeof axios === 'function' && axios.mockResolvedValue) {
    axios.mockResolvedValue({ data });
  }
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    })
  );
}

function renderCoinRoute() {
  return render(
    <MemoryRouter initialEntries={['/coin/bitcoin']}>
      <Routes>
        <Route path="/coin/:coinId" element={<Coin />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setSuccessfulFetch();
});

afterEach(() => {
  jest.clearAllMocks();
});

test('renders a relative "last updated" timestamp for the prices table after a successful refresh', async () => {
  const { container } = renderCoinRoute();

  // 1) The prices data must load first (mocked successful refresh).
  await waitFor(() => {
    expect(container.textContent).toMatch(/bitcoin|btc|50[,.]?000/i);
  });

  // 2) A relative "updated ... ago" timestamp must now be visible. This is the
  //    behavior KAN-44 adds; the current code renders no such timestamp, so the
  //    assertions below time out (fail) until the fix is in place.
  await waitFor(
    () => {
      expect(container.textContent).toMatch(/updated|refreshed/i);
      expect(container.textContent).toMatch(/\bago\b|just now/i);
    },
    { timeout: 4000 }
  );
});
