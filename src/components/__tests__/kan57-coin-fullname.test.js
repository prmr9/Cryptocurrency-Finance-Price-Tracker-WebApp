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
        // eslint-disable-next-line testing-library/no-node-access -- no class-based query in Testing Library; asserting absence of the node
        expect(document.querySelector('.coin-fullname')).toBeNull()
    })

    test('a whitespace-only name renders no coin-fullname span', () => {
        renderItem({ symbol: 'btc', name: '   ' })
        // eslint-disable-next-line testing-library/no-node-access -- no class-based query in Testing Library; asserting absence of the node
        expect(document.querySelector('.coin-fullname')).toBeNull()
    })

    test('a null name renders no coin-fullname span', () => {
        renderItem({ symbol: 'btc', name: null })
        // eslint-disable-next-line testing-library/no-node-access -- no class-based query in Testing Library; asserting absence of the node
        expect(document.querySelector('.coin-fullname')).toBeNull()
    })

    test('Coins.css defines a distinct .coin-fullname rule with a smaller, muted style', () => {
        const css = fs.readFileSync(path.join(__dirname, '..', 'Coins.css'), 'utf8')
        // Selector exists (raw file read — valid even though CSS is mocked in jsdom).
        expect(css).toMatch(/\.coin-fullname\s*\{/)
        // Muted colour + the full truncation declaration set the criteria require:
        // max-width + overflow:hidden + text-overflow:ellipsis + white-space:nowrap.
        expect(css).toMatch(/\.coin-fullname\s*\{[^}]*color\s*:\s*var\(--color-text-muted\)/)
        expect(css).toMatch(/\.coin-fullname\s*\{[^}]*max-width\s*:/)
        expect(css).toMatch(/\.coin-fullname\s*\{[^}]*overflow\s*:\s*hidden/)
        expect(css).toMatch(/\.coin-fullname\s*\{[^}]*text-overflow\s*:\s*ellipsis/)
        expect(css).toMatch(/\.coin-fullname\s*\{[^}]*white-space\s*:\s*nowrap/)
        // Font size is a fractional rem (< the ticker <p>'s default 1rem), so the
        // name reads as the secondary label. Extract and compare rather than pin
        // the exact value, so a tweak to 0.7rem/0.8rem doesn't break the test.
        const fontMatch = css.match(/\.coin-fullname\s*\{[^}]*font-size\s*:\s*([\d.]+)rem/)
        expect(fontMatch).not.toBeNull()
        expect(Number(fontMatch[1])).toBeLessThan(1)
    })

    test('the 720px breakpoint tightens .coin-fullname max-width so the row stays contained', () => {
        const css = fs.readFileSync(path.join(__dirname, '..', 'Coins.css'), 'utf8')
        // Two .coin-fullname blocks: the base rule, then the tightened one inside
        // the @media (max-width: 720px) block. The mobile cap must be smaller.
        expect(css).toMatch(/@media[^{]*max-width\s*:\s*720px/)
        const maxWidths = [...css.matchAll(/\.coin-fullname\s*\{[^}]*max-width\s*:\s*([\d.]+)px/g)]
            .map((m) => Number(m[1]))
        expect(maxWidths.length).toBeGreaterThanOrEqual(2)
        // Source order is load-bearing here, not incidental: the base rule and the
        // @media override are both plain `.coin-fullname` (equal specificity, since
        // media queries add none), so at <=720px the one written LATER wins the
        // cascade. The tightening only takes effect when the media block follows the
        // base rule -- i.e. the smaller value must be the SECOND match. Keeping the
        // positional `tightened < base` check therefore also guards against a
        // media-block-first regression, which would leave the mobile cap dead.
        // Capture now allows a decimal so an equivalent `200.0px` rewrite still parses.
        const [base, tightened] = maxWidths
        expect(tightened).toBeLessThan(base)
    })
})
