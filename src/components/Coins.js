import React, { useState, useEffect, useRef } from 'react'
import CoinItem from './CoinItem'
import Coin from '../routes/Coin'
import { Link } from 'react-router-dom'
import { track, flushAnalytics, recordReturnVisit } from '../services/analytics'
import { TRADE_URL } from '../services/uniswap'

import './Coins.css'

// KAN-7 shipped dark-only; read the shell's theme attribute with a 'dark'
// fallback so the property is present even before the attribute is set.
const currentTheme = () => {
    try {
        return document.documentElement.dataset.theme || 'dark'
    } catch (err) {
        return 'dark'
    }
}

// Debounce window before a settled search query is reported.
const SEARCH_DEBOUNCE_MS = 400

const Coins = (props) => {
    const [query, setQuery] = useState('')
    const pricesFiredRef = useRef(false)

    const search = query.trim().toLowerCase()
    const filteredCoins = search
        ? props.coins.filter((coin) =>
              coin.name.toLowerCase().includes(search) ||
              coin.symbol.toLowerCase().includes(search)
          )
        : props.coins

    // prices_viewed — fires exactly once, when the top-N cards first render with
    // live data from App.js's axios fetch. On a failed load coins stays empty and
    // this never fires (documented, accepted blind spot).
    useEffect(() => {
        if (props.coins.length > 0 && !pricesFiredRef.current) {
            pricesFiredRef.current = true
            track('prices_viewed', {
                coins_loaded_count: props.coins.length,
                load_ms: typeof props.loadMs === 'number' ? props.loadMs : null,
                theme: currentTheme()
            })
        }
        // Intentionally keyed only on the load transition (0 -> N); the ref guard
        // makes it fire once and load_ms is already set by then.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.coins.length])

    // prices_return_visit — retention signal, at most once per new session. Only
    // emitted when the helper reports a prior visit already existed.
    useEffect(() => {
        const visit = recordReturnVisit()

        if (visit && visit.is_return_visit) {
            track('prices_return_visit', {
                days_since_last_visit: visit.days_since_last_visit,
                visit_count: visit.visit_count
            })
        }
    }, [])

    // coin_searched (+ search_no_results) — debounced so it fires on a settled
    // query, not on every keystroke. Keyed on the raw query so each change
    // restarts the timer; the cleanup clears the pending timeout.
    useEffect(() => {
        const settled = query.trim()

        if (settled.length === 0) {
            return undefined
        }

        const handle = setTimeout(() => {
            const resultsCount = filteredCoins.length
            const hadMatch = resultsCount > 0

            track('coin_searched', {
                query_length: settled.length,
                results_count: resultsCount,
                had_match: hadMatch
            })

            // The out-of-scope 'coin outside the top-50' case surfaces here as a
            // real no-match signal rather than a broken search.
            if (resultsCount === 0) {
                track('search_no_results', {
                    query: settled,
                    query_length: settled.length
                })
            }
        }, SEARCH_DEBOUNCE_MS)

        return () => clearTimeout(handle)
        // Keyed on the raw query so each keystroke restarts the debounce timer;
        // filteredCoins is read fresh inside the settled callback on purpose.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query])

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
                <div className='hero-actions'>
                    <a
                        className='hero-trade-btn'
                        href={TRADE_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                        onClick={() => {
                            track('trade_cta_clicked', {
                                trade_url: TRADE_URL,
                                location: 'home_hero',
                                coin_id: null
                            })
                            flushAnalytics()
                        }}
                    >
                        Trade on Uniswap<span className='sr-only'> (opens in new tab)</span>
                    </a>
                </div>
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
                            <Link to={`/coin/${coins.id}`} state={{ source: 'home_card' }} element={<Coin />} key={coins.id}>
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
