// Migrates pre-KAN-15 client-held holdings out of localStorage and into the
// authenticated user's DB rows via POST /me/import (C16), then clears the
// migrated keys -- but ONLY once the import has actually succeeded. On
// failure the legacy keys are left untouched so the next login/signup can
// retry the same payload against the server's merge-based import (never a
// naive overwrite), guaranteeing no data loss even across a lost response.

import { importLocalData } from '../api/portfolioClient'

// One localStorage key per portfolio name POST /me/import accepts.
export const LEGACY_KEYS = {
    default: 'coinsearch.portfolio.v1',
    watchlist: 'coinsearch.watchlist.v1'
}

const readLegacyHoldings = (key) => {
    let raw = null

    try {
        raw = window.localStorage.getItem(key)
    } catch (err) {
        return []
    }

    if (!raw) {
        return []
    }

    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch (err) {
        return []
    }
}

export const hasLegacyData = () =>
    Object.values(LEGACY_KEYS).some((key) => readLegacyHoldings(key).length > 0)

// Guards against a double-invoke (e.g. React StrictMode firing an effect
// twice) triggering two concurrent imports of the same legacy data.
let migrationInProgress = false

export async function migrateLegacyData() {
    if (migrationInProgress || !hasLegacyData()) {
        return
    }

    migrationInProgress = true

    const payload = {
        default: readLegacyHoldings(LEGACY_KEYS.default),
        watchlist: readLegacyHoldings(LEGACY_KEYS.watchlist)
    }

    // POST /me/import (C16). The removeItem calls live ONLY in the resolved
    // branch below -- the rejected branch never touches LEGACY_KEYS, so a lost
    // response leaves the legacy data intact for the next login/signup to retry.
    await importLocalData(payload)
        .then(() => {
            Object.values(LEGACY_KEYS).forEach((key) => window.localStorage.removeItem(key))
        })
        .catch(() => {
            // Rejected branch: deliberately no removeItem call here.
        })

    migrationInProgress = false
}
