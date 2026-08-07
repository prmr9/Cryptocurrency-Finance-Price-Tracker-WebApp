import React from 'react'

import SparkLine from './SparkLine'
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

// KAN-59 — derive the rank-movement arrow beside the rank number.
//
// There is NO previous-rank field in the CoinGecko /coins/markets payload and
// 'no API/schema/dependency change' is a hard acceptance criterion, so we cannot
// fetch or store rank history. We deliberately do NOT derive direction from
// market_cap_rank vs the list index: both come from the SAME snapshot, so their
// disagreement measures cache-skew/tie-breaking at one instant, not movement
// over time — a fabricated before/after (and it flips on pagination / client
// re-sort / filtering). Instead we key off `market_cap_change_percentage_24h` —
// a genuinely temporal 24h signal already present as a default field of the same
// response (no App.js change, no new field). Market cap is the quantity rank is
// ordered by, so 24h market-cap momentum is the honest, non-fabricated proxy for
// rank-direction pressure: positive → moving up, negative → moving down.
//
// STRICT numeric guard: only a real finite number passes. `Number.isFinite`
// rejects null, '', undefined and NaN in one check — closing the Number(null)===0
// false-DOWN bug — and an explicit 0 also falls through to the neutral branch.
// The three distinct glyphs (▲ / ▼ / –) carry the meaning by SHAPE, so colour is
// only supplementary; srLabel is announced to assistive tech via role='img'.
const formatRankMovement = (value) => {
    const finite = typeof value === 'number' && Number.isFinite(value)
    if (finite && value > 0) {
        return { direction: 'up', className: 'rank-up', glyph: '▲', srLabel: 'rank rising' }
    }
    if (finite && value < 0) {
        return { direction: 'down', className: 'rank-down', glyph: '▼', srLabel: 'rank falling' }
    }
    return { direction: 'unchanged', className: 'rank-unchanged', glyph: '–', srLabel: 'rank unchanged' }
}

const CoinItem = (props) => {
    const change = formatChange(props.coins.price_change_percentage_24h)
    const rankMovement = formatRankMovement(props.coins.market_cap_change_percentage_24h)
    // Primary label stays the uppercase ticker. The full name is a secondary cue,
    // so only render it when it adds information: skip null/empty/whitespace-only
    // names, and skip a name that only restates the ticker (e.g. 'BTC' for 'btc')
    // to avoid a redundant 'BTC BTC'.
    const symbolUpper = props.coins.symbol.toUpperCase()
    const rawName = props.coins.name
    const fullName = typeof rawName === 'string' ? rawName.trim() : ''
    const showName = fullName.length > 0 && fullName.toUpperCase() !== symbolUpper
    return (
        <div className='coin-row'>
            <p>
                {props.coins.market_cap_rank}
                {/* Rank-movement arrow inside the existing rank cell — NOT a new
                    .coin-row flex child, so the six-column layout, sparkline and
                    coin names are untouched. role='img' + aria-label announces the
                    state and suppresses the raw glyph, mirroring SparkLine.js. */}
                <span
                    className={`rank-movement ${rankMovement.className}`}
                    role='img'
                    aria-label={rankMovement.srLabel}
                >
                    {rankMovement.glyph}
                </span>
            </p>
            <div className='img-symbol'>
                <img src={props.coins.image} alt='' />
                <div className='symbol-labels'>
                    <p>{symbolUpper}</p>
                    {showName && <span className='coin-fullname'>{fullName}</span>}
                </div>
            </div>
            <p>${props.coins.current_price.toLocaleString()}</p>
            <p className={change.className}>
                {change.display}
                <span className='sr-only'>{' '}{change.direction}</span>
                <SparkLine prices={props.coins.sparkline_in_7d && props.coins.sparkline_in_7d.price} />
            </p>
            <p className='hide-mobile'>${props.coins.total_volume.toLocaleString()}</p>
            <p className='hide-mobile'>{formatMarketCap(props.coins.market_cap)}</p>
        </div>
    )
}

export { formatRankMovement }
export default CoinItem
