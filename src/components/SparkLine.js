import React, { useMemo } from 'react'

// KAN-58 — a zero-dependency 7-day trend sparkline rendered beside the 24h
// change. Imports ONLY from react so it stays a pure presentational leaf: the
// full ~168-point CoinGecko `sparkline_in_7d.price` series comes in via props,
// no fetching or state of its own.

// Fixed geometry so an absent series reserves the SAME box the CSS reserves —
// no row-height shift / layout jump between the pre-data and post-data frames.
const WIDTH = 56
const HEIGHT = 20
const PAD = 2

// Turn a price series into an SVG polyline `points` string, or null when the
// series can't be drawn. Pure: no React, safe to unit-test in isolation.
//   - needs >= 2 finite points (a single point has no direction to show);
//   - a flat week (max === min) draws a horizontal mid-line instead of dividing
//     by a zero range;
//   - coordinates are inset by PAD so the stroke isn't clipped at the edges and
//     rounded to 2dp so we never emit long floats or NaN into the DOM.
const computeSparkline = (prices, w, h) => {
    if (!Array.isArray(prices)) {
        return null
    }
    const series = prices.filter((p) => Number.isFinite(p))
    if (series.length < 2) {
        return null
    }

    const innerW = w - 2 * PAD
    const innerH = h - 2 * PAD
    const stepX = innerW / (series.length - 1)

    const min = Math.min(...series)
    const max = Math.max(...series)
    const range = max - min

    return series
        .map((price, i) => {
            const x = PAD + i * stepX
            // SVG y grows downward, so a HIGHER price must map to a LOWER y.
            // A flat week (range === 0) pins every point to the vertical mid.
            const y = range === 0
                ? h / 2
                : PAD + (1 - (price - min) / range) * innerH
            return `${x.toFixed(2)},${y.toFixed(2)}`
        })
        .join(' ')
}

// Direction of the week from its first vs last point. Mirrors KAN-56
// `formatChange`: a direction word + slope carry the meaning independent of
// colour. Pure. Guards `first === 0` so the derived percentage never divides by
// zero (falls back to a colour/word-only label with no percentage).
const formatTrend = (first, last) => {
    const finite = Number.isFinite(first) && Number.isFinite(last)
    const diff = finite ? last - first : 0
    const pct = finite && first !== 0 ? (diff / first) * 100 : null
    const pctText = pct !== null ? ` ${Math.abs(pct).toFixed(2)}%` : ''

    if (!finite || diff === 0) {
        return { className: 'trend-flat', direction: 'flat', label: '7-day trend flat' }
    }
    if (diff > 0) {
        return { className: 'trend-up', direction: 'up', label: `7-day trend up${pctText}` }
    }
    return { className: 'trend-down', direction: 'down', label: `7-day trend down${pctText}` }
}

// prices: the coin's `sparkline_in_7d.price` array (may be undefined/short).
const SparkLine = ({ prices }) => {
    const { points, trend } = useMemo(() => {
        const pts = computeSparkline(prices, WIDTH, HEIGHT)
        if (pts === null) {
            return { points: null, trend: null }
        }
        const series = prices.filter((p) => Number.isFinite(p))
        return { points: pts, trend: formatTrend(series[0], series[series.length - 1]) }
    }, [prices])

    if (points === null) {
        // Reserved-space placeholder (same box via .coin-sparkline) so the row
        // neither crashes nor collapses when a coin has no 7-day series. Renders
        // NO text: the box is held open by CSS alone, so it can't collide with
        // the table's dash-based empty-cell queries. aria-hidden — it carries no
        // information to announce.
        return <span className='coin-sparkline coin-sparkline--empty' aria-hidden='true' />
    }

    return (
        <svg
            className='coin-sparkline'
            width={WIDTH}
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role='img'
            aria-label={trend.label}
        >
            <polyline className={trend.className} points={points} fill='none' />
        </svg>
    )
}

export { computeSparkline, formatTrend, WIDTH, HEIGHT, PAD }
export default SparkLine
