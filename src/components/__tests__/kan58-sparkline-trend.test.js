import React from 'react'
import fs from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import CoinItem from '../CoinItem'
import SparkLine, { computeSparkline, formatTrend, WIDTH, HEIGHT } from '../SparkLine'

// Regression test for KAN-58 — a 7-day trend sparkline beside the 24h change.
//
// Covers the acceptance criteria:
//  1. A 7-day trend indicator appears beside the 24h change for each coin.
//  2. It is not colour-only (the line SLOPE + a direction word carry meaning)
//     and is announced to screen readers (svg role=img + aria-label).
//  3. Existing market-table behaviour is unchanged (the 24h value still shows).

// CoinItem returns a bare <div className='coin-row'> — no <Link>, no router —
// so it renders without a MemoryRouter wrapper (matching the KAN-57 sibling).
const baseCoin = {
    market_cap_rank: 1,
    image: 'https://example.com/btc.png',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 50000,
    price_change_percentage_24h: 1.23,
    total_volume: 987654321,
    market_cap: 1234567890,
    // A rising week: last > first.
    sparkline_in_7d: { price: [100, 101, 102, 104, 108, 110, 120] },
}

const renderItem = (overrides = {}) =>
    render(<CoinItem coins={{ ...baseCoin, ...overrides }} />)

describe('KAN-58 computeSparkline (pure geometry)', () => {
    test('returns a points string for a valid series', () => {
        const points = computeSparkline([1, 2, 3, 4], WIDTH, HEIGHT)
        expect(typeof points).toBe('string')
        // n points => n coordinate pairs.
        expect(points.split(' ')).toHaveLength(4)
    })

    test('never emits NaN into coordinates', () => {
        const points = computeSparkline([100, 101, 102, 104, 108, 110, 120], WIDTH, HEIGHT)
        expect(points).not.toMatch(/NaN/)
    })

    test('a flat week (all equal) draws a horizontal mid-line, not a divide-by-zero', () => {
        const points = computeSparkline([5, 5, 5, 5], WIDTH, HEIGHT)
        expect(points).not.toMatch(/NaN/)
        // Every y coordinate is the vertical middle (HEIGHT / 2).
        const ys = points.split(' ').map((pair) => Number(pair.split(',')[1]))
        ys.forEach((y) => expect(y).toBeCloseTo(HEIGHT / 2))
    })

    test('returns null for missing / too-short / non-array series', () => {
        expect(computeSparkline(undefined, WIDTH, HEIGHT)).toBeNull()
        expect(computeSparkline(null, WIDTH, HEIGHT)).toBeNull()
        expect(computeSparkline([], WIDTH, HEIGHT)).toBeNull()
        expect(computeSparkline([42], WIDTH, HEIGHT)).toBeNull()
        expect(computeSparkline('nope', WIDTH, HEIGHT)).toBeNull()
    })

    test('drops non-finite points and needs >= 2 finite values', () => {
        expect(computeSparkline([NaN, Infinity], WIDTH, HEIGHT)).toBeNull()
        expect(computeSparkline([1, NaN], WIDTH, HEIGHT)).toBeNull()
        expect(computeSparkline([1, 2, NaN, 4], WIDTH, HEIGHT)).not.toBeNull()
    })
})

describe('KAN-58 formatTrend (direction is a non-colour cue)', () => {
    test('a rising week is up with a percentage', () => {
        const t = formatTrend(100, 120)
        expect(t.direction).toBe('up')
        expect(t.className).toBe('trend-up')
        expect(t.label).toMatch(/up/i)
        expect(t.label).toMatch(/20\.00%/)
    })

    test('a falling week is down', () => {
        const t = formatTrend(120, 100)
        expect(t.direction).toBe('down')
        expect(t.className).toBe('trend-down')
        expect(t.label).toMatch(/down/i)
    })

    test('an unchanged week is flat', () => {
        const t = formatTrend(100, 100)
        expect(t.direction).toBe('flat')
        expect(t.className).toBe('trend-flat')
    })

    test('guards first === 0 so the percentage never divides by zero', () => {
        const t = formatTrend(0, 10)
        expect(t.direction).toBe('up')
        // No NaN/Infinity leaks into the announced label.
        expect(t.label).not.toMatch(/NaN|Infinity/)
    })
})

describe('KAN-58 SparkLine component', () => {
    test('renders an svg announced to screen readers (role=img + aria-label)', () => {
        render(<SparkLine prices={[100, 110, 120]} />)
        const img = screen.getByRole('img')
        expect(img.tagName.toLowerCase()).toBe('svg')
        // The direction is announced, not colour-only.
        expect(img).toHaveAttribute('aria-label', expect.stringMatching(/7-day trend up/i))
        // The slope is a real polyline (non-colour visual cue).
        // eslint-disable-next-line testing-library/no-node-access -- asserting the polyline child geometry
        const polyline = img.querySelector('polyline')
        expect(polyline).not.toBeNull()
        expect(polyline).toHaveClass('trend-up')
        expect(polyline.getAttribute('points')).toBeTruthy()
    })

    test('renders a reserved-space placeholder (no crash) when the series is missing', () => {
        render(<SparkLine prices={undefined} />)
        // eslint-disable-next-line testing-library/no-node-access -- asserting the placeholder box + absence of svg
        expect(document.querySelector('svg')).toBeNull()
        // eslint-disable-next-line testing-library/no-node-access -- placeholder reserves the same box
        const placeholder = document.querySelector('.coin-sparkline--empty')
        expect(placeholder).not.toBeNull()
        // Hidden from assistive tech (it carries no information).
        expect(placeholder).toHaveAttribute('aria-hidden', 'true')
    })
})

describe('KAN-58 CoinItem integration', () => {
    test('the sparkline appears beside the 24h change for a coin', () => {
        renderItem()
        // The 24h value still renders (existing behaviour unchanged)...
        expect(screen.getByText('+1.23%')).toBeInTheDocument()
        // ...and the sparkline is announced alongside it. Select by accessible
        // name so the row's own coin <img> can't be mistaken for the sparkline.
        const img = screen.getByRole('img', { name: /7-day trend/i })
        expect(img).toHaveClass('coin-sparkline')
        // It lives inside the same 24h change cell, next to the value.
        // eslint-disable-next-line testing-library/no-node-access -- asserting DOM co-location within the change cell
        expect(screen.getByText('+1.23%').closest('p').contains(img)).toBe(true)
    })

    test('a coin with no 7-day series still renders the row and a placeholder', () => {
        renderItem({ sparkline_in_7d: undefined })
        // Row still shows the 24h value; no crash.
        expect(screen.getByText('+1.23%')).toBeInTheDocument()
        // eslint-disable-next-line testing-library/no-node-access -- asserting the reserved-space placeholder
        expect(document.querySelector('.coin-sparkline--empty')).not.toBeNull()
    })
})

describe('KAN-58 Coins.css reserves a fixed box and colours the trend', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'Coins.css'), 'utf8')

    test('.coin-sparkline has fixed width and height (no layout shift)', () => {
        expect(css).toMatch(/\.coin-sparkline\s*\{[^}]*width\s*:\s*56px/)
        expect(css).toMatch(/\.coin-sparkline\s*\{[^}]*height\s*:\s*20px/)
    })

    test('trend direction classes set a stroke colour from the existing tokens', () => {
        expect(css).toMatch(/\.trend-up\s*\{[^}]*stroke\s*:\s*var\(--color-positive\)/)
        expect(css).toMatch(/\.trend-down\s*\{[^}]*stroke\s*:\s*var\(--color-negative\)/)
        expect(css).toMatch(/\.trend-flat\s*\{[^}]*stroke\s*:\s*var\(--color-text\)/)
    })
})
