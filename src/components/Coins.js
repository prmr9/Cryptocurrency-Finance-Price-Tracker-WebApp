import React, { useState, useEffect, useRef } from 'react'
import CoinItem from './CoinItem'
import Coin from '../routes/Coin'
import { Link } from 'react-router-dom'
import { track } from '../services/analytics'

import './Coins.css'

// KAN-49: prices-table market-cap funnel (instruments KAN-48). localStorage
// distinguishes a genuine cross-session device return; sessionStorage kills the
// re-fire on an in-session remount (prices -> coin detail -> Back). The funnel is
// session/device-scoped, not per-user — the home route is anonymous.
const PRICES_SEEN_KEY = 'kan48_prices_seen'
const PRICES_SESSION_KEY = 'kan48_prices_session_counted'
const PRICES_SOURCE = 'prices_table'

// Data-quality signal for the completed event. missingCount uses the SAME
// predicate as KAN-48's formatMarketCap guard (!Number.isFinite), so the count
// equals the number of em-dashes rendered: null/undefined/NaN are missing while
// a legitimate 0 (and any finite number) counts as present.
const getMarketCapCoverage = (coins) => ({
    rowCount: coins.length,
    missingCount: coins.filter((coin) => !(coin && Number.isFinite(coin.market_cap))).length
})

const Coins = (props) => {
    const [query, setQuery] = useState('')

    const { coins } = props

    // Emit at most once per component instance, and only after the first
    // non-empty coins load so the coverage payload is computed over real rows.
    const emittedRef = useRef(false)
    const mountTsRef = useRef(null)
    if (mountTsRef.current === null) {
        mountTsRef.current = Date.now()
    }

    useEffect(() => {
        if (!(emittedRef.current === false && Array.isArray(coins) && coins.length > 0)) {
            return
        }

        emittedRef.current = true

        try {
            // An in-session remount was already counted: suppress a re-fire so
            // Back into the prices table is not mistaken for a fresh visit.
            if (sessionStorage.getItem(PRICES_SESSION_KEY)) {
                return
            }

            const seenBefore = localStorage.getItem(PRICES_SEEN_KEY)
            const { rowCount, missingCount } = getMarketCapCoverage(coins)
            const duration_ms = Date.now() - mountTsRef.current

            track('kan_48_viewed', { source: PRICES_SOURCE })

            if (seenBefore) {
                track('kan_48_returned', { source: PRICES_SOURCE })
            } else {
                track('kan_48_started', { source: PRICES_SOURCE })
                track('kan_48_completed', {
                    source: PRICES_SOURCE,
                    row_count: rowCount,
                    missing_market_cap_count: missingCount,
                    outcome: missingCount > 0 ? 'has_missing' : 'all_present',
                    duration_ms
                })
                localStorage.setItem(PRICES_SEEN_KEY, '1')
            }

            sessionStorage.setItem(PRICES_SESSION_KEY, '1')
        } catch (e) {
            // Telemetry must never break render: a storage or sink exception is
            // swallowed here rather than propagating into the prices table.
        }
    }, [coins])

    const search = query.trim().toLowerCase()
    const filteredCoins = search
        ? props.coins.filter((coin) =>
              coin.name.toLowerCase().includes(search) ||
              coin.symbol.toLowerCase().includes(search)
          )
        : props.coins

    return (
        <div className='container'>
            <section className='hero'>
                <h2 className='hero-title'>
                    Track live <span className='hero-accent'>crypto prices</span> in real time
                </h2>
                <p className='hero-subtitle'>
                    Prices, market caps and 24h movements for the top cryptocurrencies,
                    powered by CoinGecko. Search the market and open any coin for the full picture.
                </p>
            </section>

            <div className='coin-search'>
                <input
                    type='text'
                    className='coin-search-input'
                    placeholder='Search by name or symbol (e.g. Bitcoin, ETH)'
                    aria-label='Search coins by name or symbol'
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>

            <div>
                <div className='heading'>
                    <p>#</p>
                    <p className='coin-name'>Coin</p>
                    <p>Price</p>
                    <p>24h</p>
                    <p className='hide-mobile'>Volume</p>
                    <p className='hide-mobile'>Mkt Cap</p>
                </div>

                {filteredCoins.length === 0 ? (
                    <p className='coin-empty'>
                        No coins in the top 50 match &ldquo;{query.trim()}&rdquo;. Try another name or symbol.
                    </p>
                ) : (
                    filteredCoins.map(coins => {
                        return (
                            <Link to={`/coin/${coins.id}`} element={<Coin />} key={coins.id}>
                                <CoinItem coins={coins} />
                            </Link>

                        )
                    })
                )}

            </div>
        </div>
    )
}

export default Coins
