// Vendor-neutral analytics emitter seam for KAN-2.
//
// This module deliberately depends on nothing: no vendor SDK, no npm package,
// no network client. It exposes a single `track()` entry point behind a
// swappable sink so a future ticket can drop in a real destination by editing
// this file alone.
//
// Identity here is client-only and anonymous: a random id in localStorage plus
// a per-tab session id. This app has no accounts and no auth surface, so no
// account identifier and no signed-in-state flag is collected or emitted.
//
// Every storage access is wrapped, because Safari private mode and hardened
// browser profiles throw on access rather than returning null. Failures are
// reported with console.log(error), the repo's only error convention
// (see App.js:19-21).

export const ANON_ID_KEY = 'kan2.anon_id'
export const SESSION_ID_KEY = 'kan2.session_id'
export const ONCE_KEY_PREFIX = 'kan2.once.'
export const CLICK_HISTORY_KEY = 'kan2.trade_click_history'

const emittedOnce = new Set()

const randomId = () => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID()
        }
    } catch (error) {
        console.log(error)
    }

    return 'a' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

const readStore = (store, key) => {
    try {
        return store ? store.getItem(key) : null
    } catch (error) {
        console.log(error)
        return null
    }
}

const writeStore = (store, key, value) => {
    try {
        if (store) {
            store.setItem(key, value)
        }
    } catch (error) {
        console.log(error)
    }
}

const localStore = () => (typeof window === 'undefined' ? null : window.localStorage)

const sessionStore = () => (typeof window === 'undefined' ? null : window.sessionStorage)

const readOrCreateId = (store, key) => {
    const existing = readStore(store, key)

    if (existing) {
        return existing
    }

    const created = randomId()
    writeStore(store, key, created)

    return created
}

export const getAnonId = () => readOrCreateId(localStore(), ANON_ID_KEY)

export const getSessionId = () => readOrCreateId(sessionStore(), SESSION_ID_KEY)

const pagePath = () => {
    try {
        return window.location.pathname
    } catch (error) {
        console.log(error)
        return 'unknown'
    }
}

// The key set below is exhaustive on purpose: anon_id, session_id, page_path,
// app_version and nothing else. No account identifier, no auth-state flag.
export const baseProps = () => ({
    anon_id: getAnonId(),
    session_id: getSessionId(),
    page_path: pagePath(),
    app_version: process.env.REACT_APP_VERSION || 'unknown',
})

// Default sink. The destination is read from the environment only — there is
// no destination literal in this file, by design and by acceptance criterion.
const defaultSink = (payload) => {
    const endpoint = process.env.REACT_APP_ANALYTICS_ENDPOINT

    if (endpoint && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
            navigator.sendBeacon(
                endpoint,
                new Blob([JSON.stringify(payload)], { type: 'application/json' })
            )
        } catch (error) {
            console.log(error)
        }

        return
    }

    // No endpoint configured: nothing leaves the browser. The payload is parked
    // on window so it stays inspectable in dev, in tests and in the console.
    if (typeof window === 'undefined') {
        return
    }

    if (!Array.isArray(window.__ANALYTICS_EVENTS__)) {
        window.__ANALYTICS_EVENTS__ = []
    }

    window.__ANALYTICS_EVENTS__.push(payload)
}

let sink = defaultSink

export const setSink = (fn) => {
    sink = typeof fn === 'function' ? fn : defaultSink
}

export function track(eventName, properties) {
    const payload = {
        event: eventName,
        ts: new Date().toISOString(),
        ...baseProps(),
        ...(properties || {}),
    }

    try {
        sink(payload)
    } catch (error) {
        console.log(error)
    }

    return payload
}

// Emits at most once per session for a given dedupe key. The in-memory Set
// covers repeated calls inside one page life (including React.StrictMode's
// double-invoked effects); the sessionStorage guard survives remounts and
// soft navigations within the same tab.
export function trackOnce(dedupeKey, eventName, properties) {
    if (emittedOnce.has(dedupeKey)) {
        return null
    }

    if (readStore(sessionStore(), ONCE_KEY_PREFIX + dedupeKey)) {
        emittedOnce.add(dedupeKey)
        return null
    }

    emittedOnce.add(dedupeKey)
    writeStore(sessionStore(), ONCE_KEY_PREFIX + dedupeKey, '1')

    return track(eventName, properties)
}

const dayKey = (date) => date.toISOString().slice(0, 10)

const daysBetween = (fromDay, toDay) => {
    const from = Date.parse(fromDay + 'T00:00:00Z')
    const to = Date.parse(toDay + 'T00:00:00Z')

    if (Number.isNaN(from) || Number.isNaN(to)) {
        return 0
    }

    return Math.round((to - from) / 86400000)
}

const emptyHistory = () => ({ first_day: null, click_count: 0, days: [], reported_days: [] })

const readHistory = () => {
    const raw = readStore(localStore(), CLICK_HISTORY_KEY)

    if (!raw) {
        return emptyHistory()
    }

    try {
        const parsed = JSON.parse(raw)

        return {
            first_day: parsed.first_day || null,
            click_count: parsed.click_count || 0,
            days: Array.isArray(parsed.days) ? parsed.days : [],
            reported_days: Array.isArray(parsed.reported_days) ? parsed.reported_days : [],
        }
    } catch (error) {
        console.log(error)
        return emptyHistory()
    }
}

// Records one Trade click against the local click history and returns the
// retention properties when this click is the first of a *later* day than the
// very first click — otherwise null. At most one repeat payload per day.
export function recordTradeClickDay(now) {
    const stamp = now instanceof Date ? now : new Date(now || Date.now())
    const day = dayKey(stamp)
    const history = readHistory()

    history.click_count += 1

    if (!history.first_day) {
        history.first_day = day
    }

    if (!history.days.includes(day)) {
        history.days.push(day)
    }

    const isRepeatDay = day !== history.first_day && !history.reported_days.includes(day)

    if (isRepeatDay) {
        history.reported_days.push(day)
    }

    writeStore(localStore(), CLICK_HISTORY_KEY, JSON.stringify(history))

    if (!isRepeatDay) {
        return null
    }

    return {
        days_since_first_trade_click: daysBetween(history.first_day, day),
        click_count_lifetime: history.click_count,
        distinct_days_used: history.days.length,
    }
}

export function __resetAnalyticsForTests() {
    emittedOnce.clear()
    sink = defaultSink
}
