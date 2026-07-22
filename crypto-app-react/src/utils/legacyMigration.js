// Migrates pre-KAN-15 client-held holdings out of localStorage and into the
// authenticated user's DB rows via POST /me/import (C16), then clears the
// migrated keys -- but ONLY once the import has actually succeeded. On
// failure the legacy keys are left untouched (and the failure is rethrown)
// so the next login/signup can retry the same payload, guaranteeing no data
// loss even across a lost response.

import { importLocalData } from '../api/apiClient'

export const LEGACY_KEYS = ['coinsearch.portfolio.v1', 'coinsearch.watchlist.v1']

const readLegacyValue = (key) => {
    let raw = null

    try {
        raw = window.localStorage.getItem(key)
    } catch (err) {
        return null
    }

    if (!raw) {
        return null
    }

    try {
        return JSON.parse(raw)
    } catch (err) {
        return null
    }
}

export const hasLegacyData = () => LEGACY_KEYS.some((key) => readLegacyValue(key) !== null)

// Guards against a double-invoke (e.g. React StrictMode firing an effect
// twice) triggering two concurrent imports of the same legacy data.
let migrationInProgress = false

export async function migrateLegacyData() {
    if (migrationInProgress || !hasLegacyData()) {
        return
    }

    migrationInProgress = true

    try {
        const payload = {}
        LEGACY_KEYS.forEach((key) => {
            const value = readLegacyValue(key)
            if (value !== null) {
                payload[key] = value
            }
        })

        // POST /me/import (C16). removeItem only runs once this resolves --
        // a rejection propagates to the caller and never touches LEGACY_KEYS,
        // so a lost response leaves the legacy data intact for the next
        // login/signup to retry.
        await importLocalData(payload)
        LEGACY_KEYS.forEach((key) => window.localStorage.removeItem(key))
    } finally {
        migrationInProgress = false
    }
}
