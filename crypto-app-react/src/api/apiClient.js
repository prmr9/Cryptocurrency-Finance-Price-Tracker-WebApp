// Thin fetch wrapper -- the sole HTTP boundary between the SPA and the
// backend API (KAN-14/KAN-16 auth contracts C10-C13, C20). This is a STATIC
// SPA: it never talks to the database directly (see ../../CLAUDE.md /
// DATABASE.md §1), so this file must never contain a DB driver import, a
// connection string, or a DB credential env var -- only fetch() calls to
// backend HTTP endpoints.

const BASE_URL = process.env.REACT_APP_API_BASE_URL || ''

export class ApiError extends Error {
    constructor(message, status, body) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.body = body
    }
}

async function request(path, options = {}) {
    const { method = 'GET', body } = options

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        // Sends the secure HttpOnly session cookie (C9) on every request;
        // this is the only form of auth the client carries.
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    })

    const text = await res.text()
    const data = text ? JSON.parse(text) : null

    if (!res.ok) {
        const message = (data && data.error) || `request failed with status ${res.status}`
        throw new ApiError(message, res.status, data)
    }

    return data
}

// C10 -- create an account and start a session.
export const signup = (email, password) => request('/auth/signup', { method: 'POST', body: { email, password } })

// C11 -- verify credentials and start a session.
export const login = (email, password) => request('/auth/login', { method: 'POST', body: { email, password } })

// C12 -- revoke the current session (C20 Logout control).
export const logout = () => request('/auth/logout', { method: 'POST' })

// C13 -- the current session's public profile.
export const me = () => request('/auth/me')

// C16 -- ingest detected legacy browser-held holdings into the user's DB rows.
export const importLocalData = (payload) => request('/me/import', { method: 'POST', body: payload })
