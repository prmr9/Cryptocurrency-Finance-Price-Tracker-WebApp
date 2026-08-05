export const formatMarketCap = (value) =>
    Number.isFinite(value) ? `$${value.toLocaleString('en-US')}` : EM_DASH

Wait — I need to output the full file, not a fragment. Let me reconsider: my entire reply is written to disk byte-for-byte. I must output the complete resolved file with no partial content above.

import React, { useEffect } from 'react'

import { track } from '../services/analytics'

import './Coins.css'

const EM_DASH = '\u2014'

// Guard with Number.isFinite so null/undefined/NaN take the dash branch while a
// legitimate 0 still formats as $0. Locale pinned to 'en-US' for deterministic
// grouping regardless of the runner's default ICU locale.
export const formatMarketCap = (value) =>
    Number.isFinite(value) ? `$${value.toLocaleString('en-US')}` : EM_DASH

const CoinItem = (props) => {
    // KAN-49: emit the approved engagement event when the KAN-48 market-cap
    // surface renders. Fired from an effect so viewing the cell is recorded
    // without adding a side effect to render; re-emits if the coin or its
    // market cap changes.
    useEffect(() => {
        track('kan_48_viewed', {
            coin_id: props.coins.id,
            market_cap_rank: props.coins.market_cap_rank,
            has_market_cap: Number.isFinite(props.coins.market_cap),
        })
    }, [props.coins.id, props.coins.market_cap, props.coins.market_cap_rank])

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