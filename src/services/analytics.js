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

// KAN-6 funnel side-tables. These are versioned keys distinct from ANALYTICS_KEY
// above and from KAN-4's account key. The lifetime funnel/retention state lives
// in localStorage; the per-session dedup flags and session id live in
// sessionStorage so 'once per session' survives a full page reload instead of
// resetting on a module variable.
export const LOCAL_STORAGE_KEY = 'coinsearch.analytics.v1'
export const SESSION_STORAGE_KEY = 'coinsearch.analytics.session.v1'

// The retention window for usage_count_7d. Seven local calendar days, measured
// with localDayIndex so it is DST-correct rather than a raw 7 * DAY_MS subtraction.
const RETENTION_WINDOW_DAYS = 7

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

// Injectable clock (test/vendor seam). All KAN-6 timestamps read through clock()
// so a test can pin 'now' across a DST boundary without touching real wall time.
let nowFn = Date.now

const clock = () => {
    try {
        const t = nowFn()
        return typeof t === 'number' && !Number.isNaN(t) ? t : Date.now()
    } catch (err) {
        return Date.now()
    }
}

export const configureAnalytics = ({ sink: nextSink, flush: nextFlush, now: nextNow } = {}) => {
    sink = typeof nextSink === 'function' ? nextSink : defaultSink
    flush = typeof nextFlush === 'function' ? nextFlush : defaultFlush
    nowFn = typeof nextNow === 'function' ? nextNow : Date.now

    return { sink, flush, now: nowFn }
}

export const flushAnalytics = () => flush()

export const track = (eventName, properties) => {
    // The entire body is enclosed so track() never throws on ANY path — a storage
    // failure in touchSession, a hostile getter on a property, or a broken sink all
    // degrade to a returned event rather than taking down the view being instrumented.
    try {
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
            ts: clock(),
            session_id: session.sessionId
        }

        try {
            sink(event)
        } catch (err) {
            // A broken sink must never take the view down with it.
        }

        return event
    } catch (err) {
        // Anything unexpected still returns a well-formed, sink-free event.
        return { event: eventName, properties: {}, ts: 0, session_id: null }
    }
}

// ---------------------------------------------------------------------------
// KAN-6 wallet-onboarding funnel: anonymous client id, per-session dedup, and
// lifetime funnel/retention state. Every export below is guaranteed never to
// throw, even when window.localStorage / window.sessionStorage is disabled,
// over quota, or throws SecurityError.
// ---------------------------------------------------------------------------

// A local-calendar-day index (days since epoch in the viewer's local timezone).
// Built from the calendar Y/M/D rather than a raw ms/DAY_MS division so day
// diffs stay correct across DST transitions, when a local day is 23 or 25 hours.
const localDayIndex = (ms) => {
    const d = new Date(ms)
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

const emptyLocalState = () => ({
    v: 1,
    clientId: null,
    firstExposureConsumed: false,
    firstValueReachedAt: null,
    successDays: []
})

// Reads never throw: disabled storage, corrupt JSON, or foreign shapes all
// degrade to a fresh state.
export const readLocalState = () => {
    let raw = null

    try {
        raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    } catch (err) {
        return emptyLocalState()
    }

    if (!raw) {
        return emptyLocalState()
    }

    let parsed = null

    try {
        parsed = JSON.parse(raw)
    } catch (err) {
        return emptyLocalState()
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return emptyLocalState()
    }

    return {
        v: 1,
        clientId: typeof parsed.clientId === 'string' ? parsed.clientId : null,
        firstExposureConsumed: parsed.firstExposureConsumed === true,
        firstValueReachedAt:
            typeof parsed.firstValueReachedAt === 'number' ? parsed.firstValueReachedAt : null,
        successDays: Array.isArray(parsed.successDays)
            ? parsed.successDays.filter((ts) => typeof ts === 'number')
            : []
    }
}

// The race-safe write seam. It re-reads the freshest persisted state via
// readLocalState immediately before setItem, with NO await between the read and
// the write, so a concurrent tab's changes are not clobbered by a stale
// in-memory snapshot. successDays is seeded from the fresh copy, so a mutator
// APPENDS to the persisted array rather than replacing it. Never throws.
export const writeLocalState = (mutator) => {
    const fresh = readLocalState()
    const next = { ...fresh, successDays: fresh.successDays.slice() }

    if (typeof mutator === 'function') {
        try {
            mutator(next)
        } catch (err) {
            // A broken mutator must not throw out of a telemetry write.
        }
    }

    try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next))
    } catch (err) {
        // Quota or private mode: the state simply is not persisted this call.
    }

    return next
}

const emptySessionState = () => ({
    v: 1,
    sessionId: null,
    exposedSurfaces: {},
    flowStarted: false
})

// Session state lives in sessionStorage under SESSION_STORAGE_KEY (never a
// module-level variable and never localStorage), so 'once per session' dedup and
// the session id survive a full page reload but reset on a genuinely new session.
const readSessionState = () => {
    let raw = null

    try {
        raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    } catch (err) {
        return emptySessionState()
    }

    if (!raw) {
        return emptySessionState()
    }

    let parsed = null

    try {
        parsed = JSON.parse(raw)
    } catch (err) {
        return emptySessionState()
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return emptySessionState()
    }

    const surfaces =
        parsed.exposedSurfaces !== null &&
        typeof parsed.exposedSurfaces === 'object' &&
        !Array.isArray(parsed.exposedSurfaces)
            ? parsed.exposedSurfaces
            : {}

    return {
        v: 1,
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
        exposedSurfaces: { ...surfaces },
        flowStarted: parsed.flowStarted === true
    }
}

const writeSessionState = (state) => {
    try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state))
        return true
    } catch (err) {
        return false
    }
}

let idSeq = 0

const mintId = (prefix) => `${prefix}_${clock().toString(36)}_${(idSeq++).toString(36)}`

// Anonymous, localStorage-persisted client id. There is no auth in this app, so
// user_id is this stable 'anon_<id>'. Never throws.
export const getClientId = () => {
    const state = readLocalState()

    if (typeof state.clientId === 'string' && state.clientId) {
        return state.clientId
    }

    const id = mintId('anon')
    writeLocalState((s) => {
        s.clientId = id
    })

    return id
}

// The session id, read from and written to sessionStorage under
// SESSION_STORAGE_KEY. Never throws.
export const getOrCreateSessionId = () => {
    const state = readSessionState()

    if (typeof state.sessionId === 'string' && state.sessionId) {
        return state.sessionId
    }

    state.sessionId = mintId('sess')
    writeSessionState(state)

    return state.sessionId
}

// Returns exactly one of 'nav_link' | 'browser_history' | 'reload' | 'direct_url'
// from the in-app-navigation flag plus performance navigation timing. Never throws.
export const resolveEntryMethod = () => {
    try {
        if (hasNavigatedWithinApp) {
            return 'nav_link'
        }

        let timingType = null

        try {
            const entries = window.performance.getEntriesByType('navigation')
            const entry = entries && entries[0]
            timingType = entry && typeof entry.type === 'string' ? entry.type : null
        } catch (err) {
            timingType = null
        }

        if (timingType === 'back_forward') {
            return 'browser_history'
        }

        if (timingType === 'reload') {
            return 'reload'
        }

        return 'direct_url'
    } catch (err) {
        return 'direct_url'
    }
}

// Reduces a referrer URL to a coarse enum. Returns exactly one of 'same_origin' |
// 'external' | 'direct' and NEVER any substring of the referrer's path or query,
// so no route, wallet address, or account label can leak through referrer. Never throws.
export const classifyReferrer = (referrerUrl, currentOrigin) => {
    if (typeof referrerUrl !== 'string' || referrerUrl.trim() === '') {
        return 'direct'
    }

    let origin = null

    try {
        origin = new URL(referrerUrl).origin
    } catch (err) {
        return 'direct'
    }

    if (typeof currentOrigin === 'string' && currentOrigin !== '' && origin === currentOrigin) {
        return 'same_origin'
    }

    return 'external'
}

// Reduces an Error to a stable validation category. Returns exactly one of
// 'missing_field' | 'invalid_address' | 'duplicate_account' | 'unknown' and NEVER
// the raw err.message, so a message that happens to embed user input cannot leak.
// Never throws.
export const classifyFailure = (err) => {
    let message = ''

    try {
        if (err && typeof err.message === 'string') {
            message = err.message
        } else if (typeof err === 'string') {
            message = err
        }
    } catch (readErr) {
        message = ''
    }

    if (/already been added|duplicate/i.test(message)) {
        return 'duplicate_account'
    }

    if (/valid public wallet address|invalid address|not a valid|malformed/i.test(message)) {
        return 'invalid_address'
    }

    if (/required|missing|empty|label/i.test(message)) {
        return 'missing_field'
    }

    return 'unknown'
}

// feature_entry_point_viewed gate. is_first_exposure is a LIFETIME flag persisted
// in localStorage, so it is true exactly once per client across sessions; shouldFire
// is per-session-per-surface so the event fires at most once per surface per session.
// Never throws.
export const recordExposure = (surface) => {
    const local = readLocalState()
    const isFirstExposure = local.firstExposureConsumed !== true

    if (isFirstExposure) {
        writeLocalState((s) => {
            s.firstExposureConsumed = true
        })
    }

    const key = typeof surface === 'string' && surface ? surface : 'unknown'
    const session = readSessionState()
    const alreadyExposed = session.exposedSurfaces[key] === true

    if (!alreadyExposed) {
        session.exposedSurfaces[key] = true
        writeSessionState(session)
    }

    return { isFirstExposure, shouldFire: !alreadyExposed }
}

// feature_flow_started gate: fires at most once per session. Never throws.
export const recordFlowStartedOnce = () => {
    const session = readSessionState()
    const shouldFire = session.flowStarted !== true

    if (shouldFire) {
        session.flowStarted = true
        writeSessionState(session)
    }

    return { shouldFire }
}

// feature_first_value_reached / feature_reused state. Appends this success to the
// persisted successDays array (via writeLocalState, which re-reads first), prunes
// entries older than RETENTION_WINDOW_DAYS local days, and records the lifetime
// first-value timestamp on the first ever success. Never throws.
export const recordSuccess = () => {
    const now = clock()
    const before = readLocalState()
    const isFirstSuccess = typeof before.firstValueReachedAt !== 'number'
    const cutoffIndex = localDayIndex(now) - RETENTION_WINDOW_DAYS

    const next = writeLocalState((s) => {
        // Append this success, then drop anything outside the 7-local-day window.
        s.successDays.push(now)
        s.successDays = s.successDays.filter((ts) => localDayIndex(ts) > cutoffIndex)

        if (typeof s.firstValueReachedAt !== 'number') {
            s.firstValueReachedAt = now
        }
    })

    const firstValueAt =
        typeof next.firstValueReachedAt === 'number' ? next.firstValueReachedAt : now
    const daysSinceFirstValue = Math.max(0, localDayIndex(now) - localDayIndex(firstValueAt))

    return {
        isFirstSuccess,
        daysSinceFirstValue,
        usageCount7d: next.successDays.length,
        isLaterDayReuse: !isFirstSuccess && daysSinceFirstValue > 0
    }
}

export const getTrackedEventsForTest = () => eventBuffer.slice()

export const resetAnalyticsForTest = () => {
    hasNavigatedWithinApp = false
    sink = defaultSink
    flush = defaultFlush
    nowFn = Date.now
    eventBuffer.length = 0
    fallbackRaw = null

    try {
        window.localStorage.removeItem(ANALYTICS_KEY)
    } catch (err) {
        // Nothing to clear if storage is unavailable.
    }

    try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY)
    } catch (err) {
        // Nothing to clear if storage is unavailable.
    }

    try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
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
