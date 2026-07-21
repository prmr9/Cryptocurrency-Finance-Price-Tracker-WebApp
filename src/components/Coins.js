import React, { useState, useEffect, useRef } from 'react'
import CoinItem from './CoinItem'
import Coin from '../routes/Coin'
import { Link } from 'react-router-dom'
import { track } from '../services/analytics'

import './Coins.css'

// Debounce window for the client-side search analytics: coin_searched fires only
// after the query has settled (a pause in typing), never on every keystroke.
const SEARCH_DEBOUNCE_MS = 350

// Shared filter used both for rendering and for the debounced results_count, so
// the emitted count can never drift from what the user actually sees.
const filterCoins = (coins, rawQuery) => {
    const search = rawQuery.trim().toLowerCase()

    if (!search) {
        return coins
    }

    return coins.filter((coin) =>
        coin.name.toLowerCase().includes(search) ||
        coin.symbol.toLowerCase().includes(search)
    )
}

const Coins = (props) => {
    const [query, setQuery] = useState('')

    // loadState is injected by App from the top-50 axios fetch. Default to a
    // 'loading' sentinel so a direct render (e.g. a Coins unit test) never throws;
    // the activation event simply waits for the status to settle.
    const loadState = props.loadState || { status: 'loading', loadMs: 0, count: 0 }

    // Activation event for the KAN-7 Prices route. Fires exactly once per mount,
    // the first time the injected loadState SETTLES (loaded OR error) — never on
    // 'loading', and never gated on a non-empty row count, so a failed/empty
    // fetch still emits with a load_status signal. The ref guard keeps it from
    // re-firing on search re-renders or later prop updates.
    const pricesViewedTracked = useRef(false)

    useEffect(() => {
        if (pricesViewedTracked.current) {
            return
        }

        // Hold the activation event until the injected loadState has SETTLED
        // (loaded OR error); gating on the status rather than the row count
        // avoids a premature emit on the intermediate render where React 17
        // flushes setCoins before setPricesLoad in the un-batched axios .then.
        if (loadState.status !== 'loaded' && loadState.status !== 'error') {
            return
        }

        pricesViewedTracked.current = true
        track('prices_viewed', {
            coins_loaded_count: loadState.count,
            load_ms: loadState.loadMs,
            load_status: loadState.status,
            theme: 'dark',
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadState.status])

    // Debounced client-side search instrumentation. Keyed on the settled query so
    // it fires once per pause in typing, not per keystroke. The cleanup clears the
    // pending timer on the next query change AND on unmount / route-change, so no
    // emit can land after this component has left the tree.
    useEffect(() => {
        const trimmed = query.trim()

        // Skip empty / cleared queries entirely: no event for an emptied box.
        if (trimmed.length === 0) {
            return undefined
        }

        const coins = props.coins || []
        const timer = setTimeout(() => {
            const resultsCount = filterCoins(coins, query).length

            // PRIVACY: only the query LENGTH and the result shape reach the sink —
            // never the raw query text the user typed.
            track('coin_searched', {
                query_length: trimmed.length,
                results_count: resultsCount,
                had_match: resultsCount > 0,
            })

            // The out-of-scope "coin outside the top-50" case: emit an additional
            // engagement event so a zero-result search reads as "no match here",
            // not a broken view. Still no raw query text.
            if (resultsCount === 0) {
                track('search_no_results', {
                    query_length: trimmed.length,
                    results_count: resultsCount,
                })
            }
        }, SEARCH_DEBOUNCE_MS)

        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, props.coins])

    const filteredCoins = filterCoins(props.coins || [], query)

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
