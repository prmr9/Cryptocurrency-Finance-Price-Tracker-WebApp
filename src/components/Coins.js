import React, { useState } from 'react'
import CoinItem from './CoinItem'
import Coin from '../routes/Coin'
import { Link } from 'react-router-dom'

import './Coins.css'

const Coins = (props) => {
    const [query, setQuery] = useState('')

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
