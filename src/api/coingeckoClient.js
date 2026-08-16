// The SOLE module that calls the public CoinGecko market API from the browser
// (KAN-76). This is the HTTP boundary for CoinGecko data, mirroring
// ./apiClient.js / ./portfolioClient.js: every CoinGecko read in the SPA must
// go through these functions rather than an inline axios.get in a component,
// so screens can be rebuilt without touching data wiring (see ../CLAUDE.md).
//
// The URLs are copied byte-for-byte from main's inline fetches (App.js /
// routes/Coin.js). CoinGecko's public API needs no key, so this file reads no
// env var and hits api.coingecko.com directly -- wiring a base URL/key here
// would be a behaviour change and is out of scope for this story.

import axios from 'axios'

// Top-50 market table rows for the '/' route (was App.js's inline fetch).
export async function fetchMarketCoins() {
    const res = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true')
    return res.data
}

// Full detail for a single coin for the '/coin/:coinId' route (was
// routes/Coin.js's inline fetch). URL kept verbatim so the exact-URL contract
// in routes/Coin.test.js still intercepts through this client.
export async function fetchCoin(coinId) {
    const res = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}`)
    return res.data
}
