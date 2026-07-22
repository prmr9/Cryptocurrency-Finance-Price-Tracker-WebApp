// The SOLE module that calls GET/PUT /portfolios and POST /me/import
// (KAN-15 / contracts C14-C17). Every portfolio/watchlist read and write in
// the SPA must go through these functions rather than browser-local state --
// this is the Frontend API client data layer (see ../CLAUDE.md).

import { apiFetch } from './apiClient'

// C14 -- the authenticated user's portfolio rows (holdings scoped server-side
// by their session; never by anything the client sends).
export async function getPortfolios() {
    const data = await apiFetch('/portfolios')
    return data.portfolios
}

// C15 -- upsert one named portfolio ('default' or 'watchlist') for the
// authenticated user. `version` is the last version this client observed;
// a stale value throws VersionConflictError (see apiClient.js).
export async function putPortfolio(name, holdings, version) {
    return apiFetch('/portfolios', {
        method: 'PUT',
        body: { name, holdings, version }
    })
}

// C16 -- ingest detected legacy browser-held watchlist/portfolio data into
// the user's DB rows. The server merges rather than overwrites, so calling
// this can never discard existing server-side holdings.
export async function importLocalData({ default: defaultHoldings = [], watchlist = [] } = {}) {
    const data = await apiFetch('/me/import', {
        method: 'POST',
        body: { default: defaultHoldings, watchlist }
    })
    return data.imported
}
