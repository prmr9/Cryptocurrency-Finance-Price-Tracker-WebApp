import React from 'react'

import './Coins.css'

const EM_DASH = '\u2014'

// Guard with Number.isFinite so null/undefined/NaN take the dash branch while a
// legitimate 0 still formats as $0. Locale pinned to 'en-US' for deterministic
// grouping regardless of the runner's default ICU locale.
const formatMarketCap = (value) =>
    Number.isFinite(value) ? `$${value.toLocaleString('en-US')}` : EM_DASH

const CoinItem = (props) => {
    return (
        <div className='coin-row'>
            <p>{props.coins.market_cap_rank}</p>
            <div className='img-symbol'>
                <img src={props.coins.image} alt='' />
                <p>{props.coins.symbol.toUpperCase()}</p>
            </div>
            <p>${props.coins.current_price.toLocaleString()}</p>
            <p>{props.coins.price_change_percentage_24h.toFixed(2)}%</p>
            <p className='hide-mobile'>${props.coins.total_volume.toLocaleString()}</p>
            <p className='hide-mobile'>{formatMarketCap(props.coins.market_cap)}</p>
        </div>
    )
}

export default CoinItem
