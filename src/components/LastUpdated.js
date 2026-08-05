import React, { useEffect, useState } from 'react'

// Pure, testable compact relative-time formatter.
// Returns null for a falsy timestamp so callers can render nothing; otherwise a
// compact "updated Xs/Xm/Xh ago" string. Math.max(0, …) clamps future/clock-skewed
// timestamps to "0s" rather than emitting a negative diff.
export const formatRelative = (timestamp, now = Date.now()) => {
    if (!timestamp) return null

    const diff = Math.max(0, Math.floor((now - timestamp) / 1000))

    if (diff < 60) return `updated ${diff}s ago`
    if (diff < 3600) return `updated ${Math.floor(diff / 60)}m ago`
    return `updated ${Math.floor(diff / 3600)}h ago`
}

// Presentational, self-ticking freshness indicator. Renders nothing (and starts
// no interval) until it receives a timestamp; once it has one it re-renders every
// second so the relative label stays current. The tick is scoped to this node, so
// it never re-renders the prices table above which it sits.
const LastUpdated = ({ timestamp }) => {
    // Tick counter: bumping it forces a re-render so formatRelative recomputes.
    const [, setTick] = useState(0)

    useEffect(() => {
        if (!timestamp) return

        const id = setInterval(() => setTick((n) => n + 1), 1000)
        return () => clearInterval(id)
    }, [timestamp])

    if (!timestamp) return null

    const iso = new Date(timestamp).toISOString()
    const label = formatRelative(timestamp)

    return (
        <time className='last-updated' dateTime={iso} title={iso} aria-label={label}>
            {label}
        </time>
    )
}

export default LastUpdated
