import React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { track } from '../../services/analytics'
import Coins from '../Coins'

// KAN-49 instruments the prices-table market-cap funnel from the Coins VIEW, not
// from the pure CoinItem row. Mock the analytics sink so emitted events can be
// observed without a real vendor, and stub CoinItem + the lazily-referenced Coin
// route so a null/undefined market cap never exercises row render (the effect is
// what is under test) and axios/DOMPurify are not pulled in.
jest.mock('../../services/analytics', () => ({ track: jest.fn() }))
jest.mock('../CoinItem', () => () => null)
jest.mock('../../routes/Coin', () => () => null)

// Fixed fixture: market caps [null, undefined, 0, 12345678]. The expected
// payload values below are computed by hand from THIS fixture, not mirrored from
// the component — row_count 4, missing_market_cap_count 2 (null + undefined;
// 0 and 12345678 are finite, so present), outcome 'has_missing'.
const coinsFixture = [
    { id: 'alpha', name: 'AlphaCoin', symbol: 'ALP', market_cap: null },
    { id: 'beta', name: 'BetaCoin', symbol: 'BET', market_cap: undefined },
    { id: 'gamma', name: 'GammaCoin', symbol: 'GAM', market_cap: 0 },
    { id: 'delta', name: 'DeltaCoin', symbol: 'DEL', market_cap: 12345678 },
]

const renderCoins = (coins) =>
    render(
        <MemoryRouter>
            <Coins coins={coins} />
        </MemoryRouter>
    )

const PRICES_SEEN_KEY = 'kan48_prices_seen'
const PRICES_SESSION_KEY = 'kan48_prices_session_counted'
const SOURCE = { source: 'prices_table' }

const eventNames = () => track.mock.calls.map((call) => call[0])

beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
})

describe('KAN-49 prices-table metrics', () => {
    test('first view emits viewed + started + completed with the data-quality payload', () => {
        renderCoins(coinsFixture)

        expect(track).toHaveBeenCalledWith('kan_48_viewed', SOURCE)
        expect(track).toHaveBeenCalledWith('kan_48_started', SOURCE)
        expect(track).toHaveBeenCalledWith(
            'kan_48_completed',
            expect.objectContaining({
                source: 'prices_table',
                row_count: 4,
                missing_market_cap_count: 2,
                outcome: 'has_missing',
            })
        )

        // First visit is never a return, and the seen flag is now written so a
        // later session reads as a device return.
        expect(eventNames()).not.toContain('kan_48_returned')
        expect(localStorage.getItem(PRICES_SEEN_KEY)).toBe('1')
        expect(sessionStorage.getItem(PRICES_SESSION_KEY)).toBe('1')
    })

    test('completed carries duration_ms and a numeric row/missing count', () => {
        renderCoins(coinsFixture)

        const completed = track.mock.calls.find((call) => call[0] === 'kan_48_completed')
        expect(completed).toBeDefined()
        expect(typeof completed[1].duration_ms).toBe('number')
        expect(completed[1].row_count).toBe(4)
        expect(completed[1].missing_market_cap_count).toBe(2)
    })

    test('all-present fixture (0 counts as present) reports outcome all_present', () => {
        renderCoins([
            { id: 'a', name: 'A', symbol: 'A', market_cap: 0 },
            { id: 'b', name: 'B', symbol: 'B', market_cap: 42 },
        ])

        expect(track).toHaveBeenCalledWith(
            'kan_48_completed',
            expect.objectContaining({
                row_count: 2,
                missing_market_cap_count: 0,
                outcome: 'all_present',
            })
        )
    })

    test('return view (kan48_prices_seen pre-seeded) emits only viewed + returned', () => {
        localStorage.setItem(PRICES_SEEN_KEY, '1')

        renderCoins(coinsFixture)

        expect(track).toHaveBeenCalledWith('kan_48_viewed', SOURCE)
        expect(track).toHaveBeenCalledWith('kan_48_returned', SOURCE)
        expect(eventNames()).not.toContain('kan_48_started')
        expect(eventNames()).not.toContain('kan_48_completed')
    })

    test('an in-session remount (session flag pre-seeded) emits nothing', () => {
        sessionStorage.setItem(PRICES_SESSION_KEY, '1')

        renderCoins(coinsFixture)

        expect(track).not.toHaveBeenCalled()
    })

    test('an empty coins load emits nothing', () => {
        renderCoins([])

        expect(track).not.toHaveBeenCalled()
    })
})
