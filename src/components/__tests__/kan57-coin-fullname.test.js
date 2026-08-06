import React from 'react'
import fs from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import CoinItem from '../CoinItem'

// CoinItem returns a plain <div className='coin-row'> — no <Link>, no router —
// so it renders bare with no MemoryRouter wrapper.
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

describe('CoinItem full name beside the ticker', () => {
    test('renders both the uppercase ticker and the full name in the row', () => {
        renderItem({ symbol: 'btc', name: 'Bitcoin' })
        // Both the ticker and the full name are present.
        expect(screen.getByText('BTC')).toBeInTheDocument()
        expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    })

    test('the ticker is still rendered uppercase as the primary label', () => {
        renderItem({ symbol: 'btc', name: 'Bitcoin' })
        const ticker = screen.getByText('BTC')
        expect(ticker.textContent).toBe('BTC')
        expect(ticker.textContent).toBe(ticker.textContent.toUpperCase())
    })

    test('the full name node carries the coin-fullname class', () => {
        renderItem({ symbol: 'btc', name: 'Bitcoin' })
        const name = screen.getByText('Bitcoin')
        // className-presence check on the DOM node, not a CSSOM/getComputedStyle
        // query (CSS is mocked by identity-obj-proxy in jsdom).
        expect(name).toHaveClass('coin-fullname')
    })

    test('a name equal to the ticker (case-insensitively) renders no second label', () => {
        renderItem({ symbol: 'btc', name: 'BTC' })
        // Only one 'BTC' occurrence — the ticker — and no coin-fullname span.
        expect(screen.getAllByText('BTC')).toHaveLength(1)
        expect(document.querySelector('.coin-fullname')).toBeNull()
    })

    test('a whitespace-only name renders no coin-fullname span', () => {
        renderItem({ symbol: 'btc', name: '   ' })
        expect(document.querySelector('.coin-fullname')).toBeNull()
    })

    test('a null name renders no coin-fullname span', () => {
        renderItem({ symbol: 'btc', name: null })
        expect(document.querySelector('.coin-fullname')).toBeNull()
    })

    test('Coins.css defines a distinct .coin-fullname rule with a smaller, muted style', () => {
        const css = fs.readFileSync(path.join(__dirname, '..', 'Coins.css'), 'utf8')
        // Selector exists (raw file read — valid even though CSS is mocked in jsdom).
        expect(css).toMatch(/\.coin-fullname\s*\{/)
        // Muted colour + truncation declarations.
        expect(css).toMatch(/\.coin-fullname\s*\{[^}]*color\s*:\s*var\(--color-text-muted\)/)
        expect(css).toMatch(/\.coin-fullname\s*\{[^}]*text-overflow\s*:\s*ellipsis/)
    })
})
