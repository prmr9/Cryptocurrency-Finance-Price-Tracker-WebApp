import React from 'react'

import './Coins.css'

const EM_DASH = '\u2014'

// Guard with Number.isFinite so null/undefined/NaN take the dash branch while a
// legitimate 0 still formats as $0. Locale pinned to 'en-US' for deterministic
// grouping regardless of the runner's default ICU locale.
const formatMarketCap = (value) =>
    Number.isFinite(value) ? `$${value.toLocaleString('en-US')}` : EM_DASH

// Map the RAW 24h change to a direction class, a signed display string, and a
// direction word. Keying off the number (not the rounded string) keeps a tiny
// -0.001 negative. toFixed already prints the '-' on losses, so only gains need
// a '+' prepended; exactly 0 (and any non-finite fallback) is neutral — neither
// a gain nor a loss per the ticket. The signed string and the direction word are
// both non-colour cues so direction survives red-green colour-blindness.
const formatChange = (value) => {
    if (!Number.isFinite(value) || value === 0) {
        return { className: 'change-neutral', display: '0.00%', direction: 'no change' }
    }
    if (value > 0) {
        return { className: 'change-positive', display: `+${value.toFixed(2)}%`, direction: 'up' }
    }
    return { className: 'change-negative', display: `${value.toFixed(2)}%`, direction: 'down' }
}

const CoinItem = (props) => {
    const change = formatChange(props.coins.price_change_percentage_24h)
    return (
        <div className='coin-row'>
            <p>{props.coins.market_cap_rank}</p>
            <div className='img-symbol'>
                <img src={props.coins.image} alt='' />
                <p>{props.coins.symbol.toUpperCase()}</p>
            </div>
            <p>${props.coins.current_price.toLocaleString()}</p>
            <p className={change.className}>
                {change.display}
                <span className='sr-only'>{' '}{change.direction}</span>
            </p>
            <p className='hide-mobile'>${props.coins.total_volume.toLocaleString()}</p>
            <p className='hide-mobile'>{formatMarketCap(props.coins.market_cap)}</p>
        </div>
    )
}

export default CoinItem
