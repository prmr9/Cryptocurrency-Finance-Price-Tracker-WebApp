/**
 * KAN-8 — client-side search instrumentation privacy contract.
 *
 * The debounced search emits coin_searched (and, on zero matches, an additional
 * search_no_results) through the shared track() boundary. The one hard rule from
 * the analytics plan: NO raw query text ever reaches the sink — only the query
 * LENGTH and the result shape. This suite mocks the real analytics module (module
 * mock, NOT { virtual: true }) so it can inspect every emitted payload and prove
 * the raw query the user typed appears in none of them.
 */
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Coins from '../Coins'
import { track } from '../../services/analytics'

// Real module mock (no { virtual: true }): the path resolves to the actual
// analytics service, we simply replace its exports with spies.
jest.mock('../../services/analytics', () => ({
    track: jest.fn(),
}))

// Keep the row renderer and the lazily-referenced Coin route out of this test so
// we don't drag axios / DOMPurify into the search-instrumentation assertions.
jest.mock('../CoinItem', () => (props) => (
    <div data-testid='coin-item'>{props.coins.name}</div>
))
jest.mock('../routes/Coin', () => () => null, { virtual: true })

const COINS = [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', current_price: 50000 },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', current_price: 3000 },
]

const searchBox = () => screen.getByRole('textbox', { name: /search coins/i })

const callsFor = (eventName) =>
    track.mock.calls.filter((c) => c[0] === eventName)

const renderCoins = () =>
    render(
        <MemoryRouter>
            <Coins coins={COINS} loadState={{ status: 'loaded', loadMs: 5, count: COINS.length }} />
        </MemoryRouter>
    )

describe('Coins search analytics (KAN-8)', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    test('coin_searched fires after debounce with length/shape only — never the raw query', () => {
        renderCoins()

        const RAW_QUERY = 'bitcoin'
        fireEvent.change(searchBox(), { target: { value: RAW_QUERY } })

        // Nothing fires until the debounce window settles.
        expect(callsFor('coin_searched')).toHaveLength(0)

        act(() => {
            jest.advanceTimersByTime(500)
        })

        const searched = callsFor('coin_searched')
        expect(searched).toHaveLength(1)

        const payload = searched[0][1]
        expect(payload.query_length).toBe(RAW_QUERY.length)
        expect(payload.results_count).toBe(1)
        expect(payload.had_match).toBe(true)
        // The privacy contract: the raw query text is in no property of the payload.
        expect(JSON.stringify(payload)).not.toContain(RAW_QUERY)
    })

    test('a zero-match query additionally emits search_no_results, still with no raw query', () => {
        renderCoins()

        const RAW_QUERY = 'zzznomatch'
        fireEvent.change(searchBox(), { target: { value: RAW_QUERY } })

        act(() => {
            jest.advanceTimersByTime(500)
        })

        const searched = callsFor('coin_searched')
        const noResults = callsFor('search_no_results')

        expect(searched).toHaveLength(1)
        expect(noResults).toHaveLength(1)

        expect(searched[0][1].results_count).toBe(0)
        expect(searched[0][1].had_match).toBe(false)
        expect(noResults[0][1].query_length).toBe(RAW_QUERY.length)
        expect(noResults[0][1].results_count).toBe(0)

        // Neither payload leaks the raw query text.
        expect(JSON.stringify(searched[0][1])).not.toContain(RAW_QUERY)
        expect(JSON.stringify(noResults[0][1])).not.toContain(RAW_QUERY)
    })

    test('an empty / cleared query emits nothing', () => {
        renderCoins()

        fireEvent.change(searchBox(), { target: { value: '   ' } })
        act(() => {
            jest.advanceTimersByTime(500)
        })

        expect(callsFor('coin_searched')).toHaveLength(0)
        expect(callsFor('search_no_results')).toHaveLength(0)
    })
})
