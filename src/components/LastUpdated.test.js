import React from 'react'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import LastUpdated, { formatRelative } from './LastUpdated'

describe('formatRelative', () => {
    const now = 1_000_000_000_000 // fixed reference "now"

    test('returns null for a falsy timestamp', () => {
        expect(formatRelative(null, now)).toBeNull()
        expect(formatRelative(undefined, now)).toBeNull()
        expect(formatRelative(0, now)).toBeNull()
    })

    test('reports seconds under a minute', () => {
        expect(formatRelative(now, now)).toBe('updated 0s ago')
        expect(formatRelative(now - 12_000, now)).toBe('updated 12s ago')
        expect(formatRelative(now - 59_000, now)).toBe('updated 59s ago')
    })

    test('rolls over to minutes at 60s and stays there under an hour', () => {
        expect(formatRelative(now - 60_000, now)).toBe('updated 1m ago')
        expect(formatRelative(now - 90_000, now)).toBe('updated 1m ago')
        expect(formatRelative(now - 3_599_000, now)).toBe('updated 59m ago')
    })

    test('rolls over to hours at 3600s', () => {
        expect(formatRelative(now - 3_600_000, now)).toBe('updated 1h ago')
        expect(formatRelative(now - 7_200_000, now)).toBe('updated 2h ago')
    })

    test('clamps a future/clock-skewed timestamp to 0s', () => {
        expect(formatRelative(now + 5_000, now)).toBe('updated 0s ago')
    })
})

describe('LastUpdated component', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-08-05T00:00:00Z'))
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    test('renders nothing when no timestamp has been recorded yet', () => {
        const { container } = render(<LastUpdated timestamp={null} />)
        expect(container).toBeEmptyDOMElement()
    })

    test('self-ticks: the label advances as time passes', () => {
        const ts = Date.now()
        render(<LastUpdated timestamp={ts} />)

        expect(screen.getByText('updated 0s ago')).toBeInTheDocument()

        act(() => {
            jest.advanceTimersByTime(5000)
        })

        expect(screen.getByText('updated 5s ago')).toBeInTheDocument()
        expect(screen.queryByText('updated 0s ago')).not.toBeInTheDocument()
    })

    test('a failed refresh (unchanged timestamp) leaves the rendered text byte-identical', () => {
        const ts = Date.now() - 12_000 // last successful refresh: 12s ago
        const { rerender } = render(<LastUpdated timestamp={ts} />)

        const before = screen.getByText('updated 12s ago').textContent
        expect(before).toBe('updated 12s ago')

        // A failed refresh does NOT change lastUpdated, so the same timestamp is
        // passed again. The displayed value must be preserved exactly.
        rerender(<LastUpdated timestamp={ts} />)

        const after = screen.getByText('updated 12s ago').textContent
        expect(after).toBe(before)
    })
})
