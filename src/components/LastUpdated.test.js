import React from 'react'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'

import LastUpdated, { formatRelative } from './LastUpdated'

describe('formatRelative', () => {
  // Fixed reference point so every assertion is deterministic.
  const now = 1_700_000_000_000

  it('returns null for a falsy timestamp so callers can render nothing', () => {
    expect(formatRelative(0)).toBeNull()
    expect(formatRelative(null)).toBeNull()
    expect(formatRelative(undefined)).toBeNull()
  })

  it('formats a sub-minute diff in seconds', () => {
    expect(formatRelative(now - 5_000, now)).toBe('updated 5s ago')
    expect(formatRelative(now - 59_000, now)).toBe('updated 59s ago')
  })

  it('rolls over to minutes at the 60s boundary', () => {
    expect(formatRelative(now - 60_000, now)).toBe('updated 1m ago')
    expect(formatRelative(now - 90_000, now)).toBe('updated 1m ago')
    expect(formatRelative(now - 3_599_000, now)).toBe('updated 59m ago')
  })

  it('rolls over to hours at the 3600s boundary', () => {
    expect(formatRelative(now - 3_600_000, now)).toBe('updated 1h ago')
    expect(formatRelative(now - 7_200_000, now)).toBe('updated 2h ago')
  })

  it('clamps a future / clock-skewed timestamp to 0s instead of a negative diff', () => {
    expect(formatRelative(now + 5_000, now)).toBe('updated 0s ago')
  })
})

describe('<LastUpdated />', () => {
  // Frozen wall clock; Date.now() (used by formatRelative's default arg) and the
  // 1s interval are both driven off the fake timer clock.
  const BASE = new Date('2026-08-05T00:00:00.000Z').getTime()

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(BASE)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders nothing and starts no interval without a timestamp', () => {
    const { container } = render(<LastUpdated timestamp={null} />)

    expect(container).toBeEmptyDOMElement()
    // Guards the "starts no interval until it receives a timestamp" contract.
    expect(jest.getTimerCount()).toBe(0)
  })

  it('renders a <time> element carrying the label and ISO metadata', () => {
    const ts = BASE - 5_000
    render(<LastUpdated timestamp={ts} />)

    const el = screen.getByText('updated 5s ago')
    const iso = new Date(ts).toISOString()

    expect(el.tagName).toBe('TIME')
    expect(el).toHaveClass('last-updated')
    expect(el).toHaveAttribute('dateTime', iso)
    expect(el).toHaveAttribute('title', iso)
    expect(el).toHaveAttribute('aria-label', 'updated 5s ago')
  })

  it('self-ticks so the relative label stays current', () => {
    render(<LastUpdated timestamp={BASE - 5_000} />)
    expect(screen.getByText('updated 5s ago')).toBeInTheDocument()

    // Advance the fake clock (and thus Date.now) past the seconds->minutes boundary.
    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(screen.getByText('updated 1m ago')).toBeInTheDocument()
    expect(screen.queryByText('updated 5s ago')).not.toBeInTheDocument()
  })

  it('clears its interval on unmount', () => {
    const { unmount } = render(<LastUpdated timestamp={BASE - 1_000} />)
    expect(jest.getTimerCount()).toBe(1)

    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })
})
