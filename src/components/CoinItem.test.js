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
        const { container } = renderItem({ price_change_percentage_24h: 3.21 })
        const positive = container.querySelector('.change-positive')
        expect(positive).not.toBeNull()
        expect(container.querySelector('.change-negative')).toBeNull()
        expect(positive.textContent).toMatch(/^\+/)
        expect(positive.textContent).toMatch(/%/)
    })

    test('a loss (<0) carries change-negative, not change-positive, and keeps the -', () => {
        const { container } = renderItem({ price_change_percentage_24h: -2.5 })
        expect(container.querySelector('.change-negative')).not.toBeNull()
        expect(container.querySelector('.change-positive')).toBeNull()
        expect(container.querySelector('.change-negative').textContent).toContain('-')
    })

    test('a tiny negative value below the rounding threshold stays change-negative', () => {
        const { container } = renderItem({ price_change_percentage_24h: -0.001 })
        expect(container.querySelector('.change-negative')).not.toBeNull()
        expect(container.querySelector('.change-positive')).toBeNull()
    })

    test('exactly 0.00% carries neither the positive nor the negative class', () => {
        const { container } = renderItem({ price_change_percentage_24h: 0 })
        expect(container.querySelector('.change-positive')).toBeNull()
        expect(container.querySelector('.change-negative')).toBeNull()
    })

    test('the cell announces direction via a visually-hidden span while keeping the value', () => {
        const { container } = renderItem({ price_change_percentage_24h: 1.23 })
        const srOnly = container.querySelector('.change-positive .sr-only')
        expect(srOnly).not.toBeNull()
        expect(['up', 'down', 'no change']).toContain(srOnly.textContent.trim())
        // The percentage value must still be present in the cell (no aria-label
        // clobbering it).
        expect(container.querySelector('.change-positive').textContent).toMatch(/%/)
        // Direction is conveyed without an aria-label on the <p>.
        expect(container.querySelector('.change-positive').getAttribute('aria-label')).toBeNull()
    })

    test('Coins.css defines a colour rule for both direction classes', () => {
        const css = fs.readFileSync(path.join(__dirname, 'Coins.css'), 'utf8')
        expect(css).toMatch(/\.change-positive\s*\{[^}]*color\s*:/)
        expect(css).toMatch(/\.change-negative\s*\{[^}]*color\s*:/)
    })
})
