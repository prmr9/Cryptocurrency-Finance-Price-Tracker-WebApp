import React from 'react'
import fs from 'fs'
import path from 'path'
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

describe('CoinItem 24h change colour-coding', () => {
    test('a gain (>0) carries change-positive, not change-negative, and shows a leading +', () => {
        renderItem({ price_change_percentage_24h: 3.21 })
        const positive = screen.getByText('+3.21%')
        expect(positive).toHaveClass('change-positive')
        expect(positive).not.toHaveClass('change-negative')
        expect(positive).toHaveTextContent(/^\+/)
        expect(positive).toHaveTextContent('%')
    })

    test('a loss (<0) carries change-negative, not change-positive, and keeps the -', () => {
        renderItem({ price_change_percentage_24h: -2.5 })
        const negative = screen.getByText('-2.50%')
        expect(negative).toHaveClass('change-negative')
        expect(negative).not.toHaveClass('change-positive')
        expect(negative).toHaveTextContent('-')
    })

    test('a tiny negative value below the rounding threshold stays change-negative', () => {
        renderItem({ price_change_percentage_24h: -0.001 })
        const negative = screen.getByText('-0.00%')
        expect(negative).toHaveClass('change-negative')
        expect(negative).not.toHaveClass('change-positive')
    })

    test('exactly 0.00% carries neither the positive nor the negative class', () => {
        renderItem({ price_change_percentage_24h: 0 })
        const neutral = screen.getByText('0.00%')
        expect(neutral).not.toHaveClass('change-positive')
        expect(neutral).not.toHaveClass('change-negative')
    })

    test('the cell announces direction via a visually-hidden span while keeping the value', () => {
        renderItem({ price_change_percentage_24h: 1.23 })
        const direction = screen.getByText('up')
        expect(direction).toHaveClass('sr-only')
        const cell = screen.getByText('+1.23%')
        expect(cell).toHaveClass('change-positive')
        // The percentage value must still be present in the cell (no aria-label
        // clobbering it).
        expect(cell).toHaveTextContent('%')
        // Direction is conveyed without an aria-label on the <p>.
        expect(cell).not.toHaveAttribute('aria-label')
    })

    test('Coins.css defines a colour rule for both direction classes', () => {
        const css = fs.readFileSync(path.join(__dirname, 'Coins.css'), 'utf8')
        expect(css).toMatch(/\.change-positive\s*\{[^}]*color\s*:/)
        expect(css).toMatch(/\.change-negative\s*\{[^}]*color\s*:/)
    })
})
