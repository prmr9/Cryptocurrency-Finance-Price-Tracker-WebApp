import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import CoinItem from './CoinItem'

// The em dash rendered for a missing market cap. Same code point (U+2014) as the
// EM_DASH constant in CoinItem.js, written as the escape to avoid a copy-paste
// glyph mismatch between source and test.
const EM_DASH = '\u2014'

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
