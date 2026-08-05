import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import CoinItem, { formatMarketCap } from './CoinItem'

// KAN-48 regression coverage for the prices-table market-cap cell.
//
// The cell used to crash the whole row whenever a coin's `market_cap` was
// null/undefined, because CoinItem inlined an UNGUARDED
// `props.coins.market_cap.toLocaleString()` and `null.toLocaleString()` /
// `undefined.toLocaleString()` throw a TypeError.
//
// The fix extracts a colocated pure helper `formatMarketCap(value)` that guards
// with `Number.isFinite(value)`: it returns an em dash for non-finite values and
// a thousands-grouped string (via `value.toLocaleString('en-US')`) otherwise.
//
// Two layers of coverage below: the first exercises the exported helper directly
// (unit), the second renders CoinItem and asserts the cell's rendered text
// (integration). Both fail on the buggy code and pass only once the guarded,
// exported helper exists.

// The em dash rendered for a missing market cap. Same code point (U+2014) as the
// EM_DASH constant in CoinItem.js, written as the escape to avoid a copy-paste
// glyph mismatch between source and test.
const EM_DASH = '\u2014'

describe('formatMarketCap (KAN-48 regression)', () => {
    it('returns a dash instead of throwing when market cap is null', () => {
        expect(() => formatMarketCap(null)).not.toThrow()
        expect(formatMarketCap(null)).toBe(EM_DASH)
    })

    it('returns a dash instead of throwing when market cap is undefined', () => {
        expect(() => formatMarketCap(undefined)).not.toThrow()
        expect(formatMarketCap(undefined)).toBe(EM_DASH)
    })

    it('formats a finite market cap with thousands separators', () => {
        expect(formatMarketCap(1234567890)).toContain('1,234,567,890')
    })
})

// Supply every field CoinItem accesses unconditionally so no unrelated render
// line throws; market_cap is overridden per case.
const baseCoin = {
    market_cap_rank: 1,
    image: 'https://example.com/btc.png',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 50000,
    price_change_percentage_24h: 1.23,
    total_volume: 987654321,
    market_cap: 1234567890,
}

const renderItem = (overrides = {}) =>
    render(<CoinItem coins={{ ...baseCoin, ...overrides }} />)

describe('CoinItem market cap formatting', () => {
    test('formats a nine-digit market cap with thousands separators', () => {
        renderItem({ market_cap: 1234567890 })
        expect(screen.getByText('$1,234,567,890')).toBeInTheDocument()
    })

    test('renders a dash (not NaN/undefined) when market cap is null', () => {
        renderItem({ market_cap: null })
        expect(screen.getByText(EM_DASH)).toBeInTheDocument()
        expect(screen.queryByText(/NaN/)).toBeNull()
        expect(screen.queryByText(/undefined/)).toBeNull()
    })

    test('renders a dash (not NaN/undefined) when market cap is undefined', () => {
        renderItem({ market_cap: undefined })
        expect(screen.getByText(EM_DASH)).toBeInTheDocument()
        expect(screen.queryByText(/NaN/)).toBeNull()
        expect(screen.queryByText(/undefined/)).toBeNull()
    })

    test('formats a legitimate 0 market cap as $0, not a dash', () => {
        renderItem({ market_cap: 0 })
        expect(screen.getByText('$0')).toBeInTheDocument()
        expect(screen.queryByText(EM_DASH)).toBeNull()
    })
})