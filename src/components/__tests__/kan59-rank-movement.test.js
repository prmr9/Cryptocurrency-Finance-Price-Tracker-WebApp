import React from 'react'
import fs from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import CoinItem, { formatRankMovement } from '../CoinItem'

// Regression test for KAN-59 — a rank-movement arrow beside the rank number.
//
// Covers the acceptance criteria:
//  1. Each row shows an up/down/unchanged rank indicator beside the rank number.
//  2. Not colour-only: the glyph SHAPE (▲ / ▼ / –) carries the meaning and the
//     state is announced to screen readers (span role=img + aria-label).
//  3. Existing market-table behaviour (rank number, 24h value) is unchanged.
//  4. No API/schema/dependency change: direction is derived from
//     market_cap_change_percentage_24h, already a default field of the payload.

// CoinItem returns a bare <div className='coin-row'> — no <Link>, no router —
// so it renders without a MemoryRouter wrapper (matching the KAN-57/58 siblings).
const baseCoin = {
    market_cap_rank: 1,
    image: 'https://example.com/btc.png',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 50000,
    price_change_percentage_24h: 1.23,
    total_volume: 987654321,
    market_cap: 1234567890,
    // A positive 24h market-cap change → rank rising.
    market_cap_change_percentage_24h: 2.5,
}

const renderItem = (overrides = {}) =>
    render(<CoinItem coins={{ ...baseCoin, ...overrides }} />)

describe('KAN-59 formatRankMovement (pure helper)', () => {
    test('a positive 24h market-cap change is rising (up)', () => {
        const m = formatRankMovement(2.5)
        expect(m.direction).toBe('up')
        expect(m.className).toBe('rank-up')
        expect(m.glyph).toBe('▲')
        expect(m.srLabel).toMatch(/rising/i)
    })

    test('a negative 24h market-cap change is falling (down)', () => {
        const m = formatRankMovement(-2.5)
        expect(m.direction).toBe('down')
        expect(m.className).toBe('rank-down')
        expect(m.glyph).toBe('▼')
        expect(m.srLabel).toMatch(/falling/i)
    })

    test('exactly 0 is unchanged (neither up nor down)', () => {
        const m = formatRankMovement(0)
        expect(m.direction).toBe('unchanged')
        expect(m.className).toBe('rank-unchanged')
        expect(m.glyph).toBe('–')
        expect(m.srLabel).toMatch(/unchanged/i)
    })

    test('STRICT guard: null/undefined/empty-string/NaN all fall to unchanged, never a false DOWN', () => {
        // Number(null) === 0 and Number('') === 0 would slip past a NaN-only
        // guard; the typeof + Number.isFinite guard rejects every one of these.
        for (const bad of [null, undefined, '', NaN, 'nope', {}, []]) {
            const m = formatRankMovement(bad)
            expect(m.direction).toBe('unchanged')
            expect(m.className).toBe('rank-unchanged')
            expect(m.glyph).toBe('–')
        }
    })

    test('a tiny positive value below any rounding threshold still counts as up', () => {
        expect(formatRankMovement(0.0001).direction).toBe('up')
        expect(formatRankMovement(-0.0001).direction).toBe('down')
    })
})

describe('KAN-59 CoinItem rendered arrow', () => {
    test('renders the arrow announced to screen readers (role=img + aria-label) beside the rank', () => {
        renderItem({ market_cap_change_percentage_24h: 2.5 })
        // Select by accessible name so neither the coin <img> nor the sparkline
        // svg is mistaken for the rank arrow.
        const arrow = screen.getByRole('img', { name: /rank rising/i })
        expect(arrow).toHaveClass('rank-movement')
        expect(arrow).toHaveClass('rank-up')
        expect(arrow).toHaveTextContent('▲')
        // The rank number still renders in the same cell (existing behaviour).
        // eslint-disable-next-line testing-library/no-node-access -- asserting co-location within the rank cell
        const rankCell = arrow.closest('p')
        expect(rankCell).toHaveTextContent('1')
    })

    test('renders the DOWN arrow for a negative 24h market-cap change', () => {
        renderItem({ market_cap_change_percentage_24h: -3.1 })
        const arrow = screen.getByRole('img', { name: /rank falling/i })
        expect(arrow).toHaveClass('rank-down')
        expect(arrow).toHaveTextContent('▼')
    })

    test('renders the UNCHANGED arrow (and does not crash) when the field is missing', () => {
        renderItem({ market_cap_change_percentage_24h: undefined })
        const arrow = screen.getByRole('img', { name: /rank unchanged/i })
        expect(arrow).toHaveClass('rank-unchanged')
        expect(arrow).toHaveTextContent('–')
    })

    test('existing market-table behaviour is unchanged: the 24h value and coin name still render', () => {
        renderItem()
        // 24h change value (KAN-56) unchanged.
        expect(screen.getByText('+1.23%')).toBeInTheDocument()
        // Coin full name (KAN-57) unchanged.
        expect(screen.getByText('Bitcoin')).toBeInTheDocument()
        // Sparkline is unaffected by the rank cell change — no crash with a
        // series present.
        renderItem({ sparkline_in_7d: { price: [1, 2, 3] } })
        expect(screen.getAllByText('+1.23%').length).toBeGreaterThan(0)
    })
})

describe('KAN-59 Coins.css colours the three rank-movement states', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'Coins.css'), 'utf8')

    test('each direction class sets a colour from the existing tokens (supplementary to the glyph shape)', () => {
        expect(css).toMatch(/\.rank-up\s*\{[^}]*color\s*:\s*var\(--color-positive\)/)
        expect(css).toMatch(/\.rank-down\s*\{[^}]*color\s*:\s*var\(--color-negative\)/)
        expect(css).toMatch(/\.rank-unchanged\s*\{[^}]*color\s*:\s*var\(--color-text-muted\)/)
    })
})
