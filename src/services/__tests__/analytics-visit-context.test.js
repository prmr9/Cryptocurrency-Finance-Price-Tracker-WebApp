/**
 * KAN-8 — cross-session retention helpers.
 *
 * getVisitContext() must classify the current App mount across three branches
 * without ever writing on the read path, and recordVisit() must be idempotent
 * per session id. These drive the `prices_return_visit` event from App.js, so
 * their branch behaviour is asserted directly against the real module here
 * (real module import — NOT jest.mock({ virtual: true })).
 */
import {
    getVisitContext,
    recordVisit,
    touchSession,
    resetAnalyticsForTest
} from '../analytics'

const VISIT_KEY = 'analytics_visit_v1'

describe('KAN-8 getVisitContext / recordVisit', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        window.localStorage.clear()
        resetAnalyticsForTest()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    test('first-visit branch: no record yet reads as a brand-new visitor', () => {
        touchSession()

        const ctx = getVisitContext()

        expect(ctx.is_first_visit).toBe(true)
        expect(ctx.is_new_session).toBe(true)
        expect(ctx.visit_count).toBe(1)
        expect(ctx.days_since_last_visit).toBeNull()
    })

    test('the read path performs NO localStorage write', () => {
        touchSession()
        recordVisit()

        const before = window.localStorage.getItem(VISIT_KEY)
        const setSpy = jest.spyOn(window.Storage.prototype, 'setItem')

        getVisitContext()

        expect(setSpy).not.toHaveBeenCalled()
        expect(window.localStorage.getItem(VISIT_KEY)).toBe(before)
        setSpy.mockRestore()
    })

    test('same-session branch: a repeat mount in one session is not a new session', () => {
        touchSession()
        recordVisit()

        const ctx = getVisitContext()

        expect(ctx.is_first_visit).toBe(false)
        expect(ctx.is_new_session).toBe(false)
        // The current visit was already counted; the prospective count holds.
        expect(ctx.visit_count).toBe(1)
    })

    test('new-session branch: after the session times out the visitor is returning', () => {
        touchSession()
        recordVisit()

        // Advance past the 30-minute inactivity window so touchSession mints a
        // fresh session id, distinguishing this mount from the recorded one.
        jest.setSystemTime(new Date('2026-01-01T02:00:00Z'))
        touchSession()

        const ctx = getVisitContext()

        expect(ctx.is_first_visit).toBe(false)
        expect(ctx.is_new_session).toBe(true)
        expect(ctx.visit_count).toBe(2)
    })

    test('recordVisit is idempotent within a single session', () => {
        touchSession()
        const first = recordVisit()
        const second = recordVisit()

        expect(first.visit_count).toBe(1)
        // Same session id => no-op, so the count does not advance on re-record.
        expect(second.visit_count).toBe(1)
    })

    test('recordVisit advances the persisted count once a new session begins', () => {
        touchSession()
        recordVisit()

        jest.setSystemTime(new Date('2026-01-01T02:00:00Z'))
        touchSession()
        const advanced = recordVisit()

        expect(advanced.is_new_session).toBe(true)
        expect(advanced.visit_count).toBe(2)
    })
})
