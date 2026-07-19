// Local persistence for wallet accounts.
//
// SECURITY: a stored record holds a user-chosen label and a PUBLIC wallet
// address only. Never persist a private key, seed phrase, mnemonic or
// password here — localStorage is readable by any script running on the page.
//
// MIGRATION SEAM: every public method below returns a Promise even though
// localStorage is synchronous. Swapping these bodies for fetch('/api/accounts')
// calls later must touch this file and zero components.

const STORAGE_KEY = 'coinsearch.accounts.v1'

export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

const emptyState = () => ({ version: 1, accounts: [], activeAccountId: null })

let idCounter = 0

const nextId = () => `acct_${Date.now().toString(36)}_${idCounter++}`

export const normalizeAddress = (address) =>
    typeof address === 'string' ? address.trim().toLowerCase() : ''

const isValidRow = (row) =>
    row !== null &&
    typeof row === 'object' &&
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.label === 'string' &&
    typeof row.address === 'string' &&
    ADDRESS_RE.test(row.address)

// Reads must never throw: corrupt, partial or foreign JSON degrades to the
// empty state rather than white-screening the app on mount.
const readState = () => {
    let raw = null

    try {
        raw = window.localStorage.getItem(STORAGE_KEY)
    } catch (err) {
        return emptyState()
    }

    if (!raw) {
        return emptyState()
    }

    let parsed = null

    try {
        parsed = JSON.parse(raw)
    } catch (err) {
        return { version: 1, accounts: [], activeAccountId: null }
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return emptyState()
    }

    if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) {
        return emptyState()
    }

    const accounts = parsed.accounts.filter(isValidRow).map((row) => ({
        id: row.id,
        label: row.label,
        address: normalizeAddress(row.address),
        chainId: typeof row.chainId === 'number' ? row.chainId : 1,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : ''
    }))

    // Reconcile a dangling pointer: an activeAccountId that no longer names a
    // surviving account is coerced to null.
    const activeAccountId =
        typeof parsed.activeAccountId === 'string' &&
        accounts.some((a) => a.id === parsed.activeAccountId)
            ? parsed.activeAccountId
            : null

    return { version: 1, accounts, activeAccountId }
}

const writeState = (state) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (err) {
        throw new Error('Could not save accounts in this browser. Storage may be full or unavailable.')
    }
}

export const listAccounts = () => Promise.resolve(readState().accounts)

export const getActiveAccountId = () => Promise.resolve(readState().activeAccountId)

export const addAccount = ({ label, address, chainId } = {}) => {
    const cleanLabel = typeof label === 'string' ? label.trim() : ''
    const cleanAddress = normalizeAddress(address)

    if (cleanLabel.length === 0) {
        return Promise.reject(new Error('Label is required.'))
    }

    if (!ADDRESS_RE.test(cleanAddress)) {
        return Promise.reject(
            new Error('Enter a valid public wallet address (0x followed by 40 hex characters).')
        )
    }

    const state = readState()

    if (state.accounts.some((a) => a.address === cleanAddress)) {
        return Promise.reject(new Error('That wallet address has already been added.'))
    }

    const account = {
        id: nextId(),
        label: cleanLabel,
        address: cleanAddress,
        chainId: typeof chainId === 'number' ? chainId : Number(chainId) || 1,
        createdAt: new Date().toISOString()
    }

    const accounts = state.accounts.concat(account)
    const activeAccountId = state.activeAccountId === null ? account.id : state.activeAccountId

    try {
        writeState({ version: 1, accounts, activeAccountId })
    } catch (err) {
        return Promise.reject(err)
    }

    return Promise.resolve(account)
}

export const removeAccount = (id) => {
    const state = readState()
    const accounts = state.accounts.filter((a) => a.id !== id)

    // Removing the active account promotes the first survivor, or clears the
    // pointer when nothing is left.
    let activeAccountId = state.activeAccountId

    if (activeAccountId === id || !accounts.some((a) => a.id === activeAccountId)) {
        activeAccountId = accounts.length > 0 ? accounts[0].id : null
    }

    try {
        writeState({ version: 1, accounts, activeAccountId })
    } catch (err) {
        return Promise.reject(err)
    }

    return Promise.resolve({ accounts, activeAccountId })
}

export const setActiveAccount = (id) => {
    const state = readState()

    if (!state.accounts.some((a) => a.id === id)) {
        return Promise.reject(new Error('That account no longer exists.'))
    }

    try {
        writeState({ version: 1, accounts: state.accounts, activeAccountId: id })
    } catch (err) {
        return Promise.reject(err)
    }

    return Promise.resolve(id)
}
