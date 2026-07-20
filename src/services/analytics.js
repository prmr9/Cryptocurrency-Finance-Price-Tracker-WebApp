// Vendor-neutral analytics emitter for the wallet-account onboarding funnel.
//
// PRIVACY: no raw wallet address and no raw account identifier ever reaches the
// sink. Identifiers are one-way hashed inside track() at the emit boundary, not
// at the call sites, so no caller can leak one by forgetting to hash. Addresses
// are never passed in at all — call sites hand over classifyAddressFormat()'s
// shape enum instead of the value.
//
// DEPENDENCY DIRECTION: this module must never import accountStore.js. The
// components own the store and pass already-loaded data into track() calls;
// importing the store here would build a persistence <-> telemetry cycle.
//
// STORAGE: this module owns exactly one key, ANALYTICS_KEY, and neither reads
// nor writes KAN-4's account key. Every access is wrapped so a private-mode
// QuotaExceededError degrades telemetry to memory instead of breaking the view
// it is instrumenting.

const ANALYTICS_KEY = 'cfpt.analytics.v1'

// A session is a 30-minute inactivity window. State lives in the localStorage
// key above rather than in per-tab storage, so several open tabs share one
// session and closing a tab does not fabricate a new one.
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

const RING_BUFFER_CAP = 200

// Properties whose values are account identifiers. track() hashes each of these
// before handing the payload to the sink.
const HASHED_PROPERTIES = ['account_id', 'previous_active_account_id', 'active_account_id']

// Properties whose values are derived from a wallet address. The contract is
// that nothing address-derived reaches the sink, so track() drops these at the
// emit boundary for the same reason identifiers are hashed there rather than at
// the call sites: no caller can leak one by forgetting.
const ADDRESS_DERIVED_PROPERTIES = ['address_length']

const emptyAnalyticsState = () => ({
    v: 1,
    sessionId: null,
    lastActivityAt: 0,
    sessionCount: 0,
    firstAccountAt: null,
    firstAccountSessionCount: null,
    accountFirstSeenAt: {},
    preexistingAccountIds: []
})

// In-memory stand-in for the storage slot, used when localStorage throws.
let fallbackRaw = null

const readRaw = () => {
    try {
        const stored = window.localStorage.getItem(ANALYTICS_KEY)
        return stored === null || stored === undefined ? fallbackRaw : stored
    } catch (err) {
        return fallbackRaw
    }
}

const writeRaw = (raw) => {
    fallbackRaw = raw

    try {
        window.localStorage.setItem(ANALYTICS_KEY, raw)
    } catch (err) {
        // Quota or private mode: the in-memory copy above is the whole fallback.
    }
}

// Reads never throw: corrupt or foreign JSON degrades to a fresh state.
const readState = () => {
    const raw = readRaw()

    if (!raw) {
        return emptyAnalyticsState()
    }

    let parsed = null

    try {
        parsed = JSON.parse(raw)
    } catch (err) {
        return emptyAnalyticsState()
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.v !== 1) {
        return emptyAnalyticsState()
    }

    const firstSeen =
        parsed.accountFirstSeenAt !== null &&
        typeof parsed.accountFirstSeenAt === 'object' &&
        !Array.isArray(parsed.accountFirstSeenAt)
            ? parsed.accountFirstSeenAt
            : {}

    return {
        v: 1,
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
        lastActivityAt: typeof parsed.lastActivityAt === 'number' ? parsed.lastActivityAt : 0,
        sessionCount: typeof parsed.sessionCount === 'number' ? parsed.sessionCount : 0,
        firstAccountAt: typeof parsed.firstAccountAt === 'number' ? parsed.firstAccountAt : null,
        firstAccountSessionCount:
            typeof parsed.firstAccountSessionCount === 'number'
                ? parsed.firstAccountSessionCount
                : null,
        accountFirstSeenAt: { ...firstSeen },
        preexistingAccountIds: Array.isArray(parsed.preexistingAccountIds)
            ? parsed.preexistingAccountIds.filter((id) => typeof id === 'string')
            : []
    }
}

const writeState = (state) => writeRaw(JSON.stringify(state))

let sessionSeq = 0

const nextSessionId = () => `sess_${Date.now().toString(36)}_${(sessionSeq++).toString(36)}`

// Mints a new session id and increments the persisted session counter only when
// the gap since the last recorded activity exceeds SESSION_TIMEOUT_MS. On a cold
// start lastActivityAt is 0, so the very first call always opens session 1.
export const touchSession = () => {
    const state = readState()
    const now = Date.now()
    const elapsed = now - state.lastActivityAt

    if (elapsed > SESSION_TIMEOUT_MS) {
        state.sessionId = nextSessionId()
        state.sessionCount = state.sessionCount + 1
    }

    state.lastActivityAt = now
    writeState(state)

    return { sessionId: state.sessionId, sessionCount: state.sessionCount }
}

export const getSessionInfo = () => {
    const state = readState()

    return {
        sessionId: state.sessionId,
        sessionCount: state.sessionCount,
        lastActivityAt: state.lastActivityAt
    }
}

// Flipped the first time the user moves between routes inside this SPA
// instance. It is the signal that distinguishes a Back into /accounts (there was
// somewhere to go back to) from a cold direct hit on the URL.
let hasNavigatedWithinApp = false

export const noteInAppNavigation = () => {
    hasNavigatedWithinApp = true
}

export const hasNavigatedInApp = () => hasNavigatedWithinApp

// Returns exactly one of 'in_app_nav' | 'browser_history' | 'reload' | 'direct_url'.
export const resolveEntrySource = (navigationType) => {
    // Ordered deliberately: a POP once this instance has already navigated is
    // Back/Forward within the app, and is classified before any branch that can
    // fall through to 'direct_url'.
    if (navigationType === 'POP' && hasNavigatedWithinApp) {
        return 'browser_history'
    }

    if (hasNavigatedWithinApp) {
        return 'in_app_nav'
    }

    let timingType = null

    try {
        const entries = window.performance.getEntriesByType('navigation')
        const entry = entries && entries[0]
        timingType = entry && typeof entry.type === 'string' ? entry.type : null
    } catch (err) {
        // No navigation timing entry (older browser, or the API is stubbed out):
        // fall through to 'direct_url' rather than throwing on the view's mount.
        timingType = null
    }

    if (timingType === 'back_forward') {
        return 'browser_history'
    }

    if (timingType === 'reload') {
        return 'reload'
    }

    return 'direct_url'
}

// FNV-1a 32-bit, base36-encoded. One-way, so it is irrelevant whether an account
// is keyed by generated id or by wallet address — neither can be recovered.
export const hashAccountId = (rawId) => {
    if (rawId === null || rawId === undefined) {
        return null
    }

    const input = String(rawId)
    let hash = 0x811c9dc5

    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }

    return `acct_${(hash >>> 0).toString(36)}`
}

// Reports the SHAPE of an address and never the address itself. Replaces a raw
// address_length, which for EVM is a near-constant 42 and carries no signal.
export const classifyAddressFormat = (address) => {
    if (typeof address !== 'string') {
        return 'empty'
    }

    const trimmed = address.trim()

    if (trimmed.length === 0) {
        return 'empty'
    }

    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        return 'evm_hex_42'
    }

    if (/^[0-9a-fA-F]{40}$/.test(trimmed)) {
        return 'evm_hex_40_no_prefix'
    }

    const body = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed

    if (!/^[0-9a-fA-F]*$/.test(body)) {
        return 'non_hex'
    }

    return body.length < 40 ? 'too_short' : 'too_long'
}

// Records when an account was first observed, so account_age_days is real rather
// than guessed. Accounts that predate instrumentation never get an entry here and
// therefore report null, not 0.
export const noteAccountFirstSeen = (accountId, timestamp) => {
    const hashed = hashAccountId(accountId)

    if (hashed === null) {
        return null
    }

    const state = readState()
    const at = typeof timestamp === 'number' ? timestamp : Date.now()

    if (typeof state.accountFirstSeenAt[hashed] !== 'number') {
        state.accountFirstSeenAt[hashed] = at
    }

    if (state.firstAccountAt === null) {
        state.firstAccountAt = state.accountFirstSeenAt[hashed]
        state.firstAccountSessionCount = state.sessionCount
    }

    writeState(state)

    return state.accountFirstSeenAt[hashed]
}

// Marks accounts that already existed when instrumentation first ran, so they are
// never mistaken later for accounts created under observation.
export const notePreexistingAccounts = (accountIds) => {
    if (!Array.isArray(accountIds)) {
        return []
    }

    const state = readState()
    const known = state.preexistingAccountIds.slice()

    accountIds.forEach((id) => {
        const hashed = hashAccountId(id)

        if (
            hashed !== null &&
            typeof state.accountFirstSeenAt[hashed] !== 'number' &&
            known.indexOf(hashed) === -1
        ) {
            known.push(hashed)
        }
    })

    state.preexistingAccountIds = known
    writeState(state)

    return known
}

// null (not 0, not NaN) for an account created before instrumentation shipped.
export const getAccountAgeDays = (accountId) => {
    const hashed = hashAccountId(accountId)

    if (hashed === null) {
        return null
    }

    const firstSeen = readState().accountFirstSeenAt[hashed]

    if (typeof firstSeen !== 'number') {
        return null
    }

    return Math.max(0, Math.floor((Date.now() - firstSeen) / DAY_MS))
}

export const getRetentionContext = () => {
    const state = readState()

    if (typeof state.firstAccountAt !== 'number') {
        return {
            isReturning: false,
            daysSinceFirstAccount: null,
            sessionsSinceFirstAccount: null
        }
    }

    const sessionsSince =
        typeof state.firstAccountSessionCount === 'number'
            ? Math.max(0, state.sessionCount - state.firstAccountSessionCount)
            : null

    return {
        isReturning: sessionsSince !== null && sessionsSince > 0,
        daysSinceFirstAccount: Math.max(0, Math.floor((Date.now() - state.firstAccountAt) / DAY_MS)),
        sessionsSinceFirstAccount: sessionsSince
    }
}

// Default sink: a bounded, synchronous in-memory ring buffer plus a hand-off to
// whichever page-level collector the host document installed. No network, no
// dependency. configureAnalytics swaps in a real vendor without touching a
// single component.
const eventBuffer = []

const deliverSafely = (deliver) => {
    try {
        deliver()
    } catch (err) {
        // One broken page sink must not stop the others, and must never take
        // down the view it is instrumenting.
    }
}

// The ring buffer is a local copy, not a destination: without this the events
// never leave the module. Payloads reaching here are already hashed and
// shape-only (see track()), so no wallet address or account label escapes.
const forwardToGlobalSinks = (event) => {
    if (typeof window === 'undefined') {
        return
    }

    const { analytics, track: globalTrack, dataLayer } = window

    if (analytics && typeof analytics.track === 'function') {
        deliverSafely(() => analytics.track(event.event, event.properties))
    }

    if (typeof globalTrack === 'function') {
        deliverSafely(() => globalTrack(event.event, event.properties))
    }

    if (dataLayer && typeof dataLayer.push === 'function') {
        deliverSafely(() => dataLayer.push({ event: event.event, ...event.properties }))
    }
}

const defaultSink = (event) => {
    eventBuffer.push(event)

    while (eventBuffer.length > RING_BUFFER_CAP) {
        eventBuffer.shift()
    }

    forwardToGlobalSinks(event)
}

const defaultFlush = () => Promise.resolve()

let sink = defaultSink
let flush = defaultFlush

export const configureAnalytics = ({ sink: nextSink, flush: nextFlush } = {}) => {
    sink = typeof nextSink === 'function' ? nextSink : defaultSink
    flush = typeof nextFlush === 'function' ? nextFlush : defaultFlush

    return { sink, flush }
}

export const flushAnalytics = () => flush()

export const track = (eventName, properties) => {
    const session = touchSession()
    const payload = { ...(properties || {}) }

    HASHED_PROPERTIES.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            payload[key] = hashAccountId(payload[key])
        }
    })

    ADDRESS_DERIVED_PROPERTIES.forEach((key) => {
        delete payload[key]
    })

    const event = {
        event: eventName,
        properties: payload,
        ts: Date.now(),
        session_id: session.sessionId
    }

    try {
        sink(event)
    } catch (err) {
        // A broken sink must never take the view down with it.
    }

    return event
}

export const getTrackedEventsForTest = () => eventBuffer.slice()

export const resetAnalyticsForTest = () => {
    hasNavigatedWithinApp = false
    sink = defaultSink
    flush = defaultFlush
    eventBuffer.length = 0
    fallbackRaw = null

    try {
        window.localStorage.removeItem(ANALYTICS_KEY)
    } catch (err) {
        // Nothing to clear if storage is unavailable.
    }
}

// The last event of a session must survive a future asynchronous sink, so the
// document-unloading path flushes explicitly.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => {
        flushAnalytics()
    })
}
