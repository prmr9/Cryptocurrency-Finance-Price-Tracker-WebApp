// Thin fetch wrapper -- the sole HTTP boundary between the SPA and the backend
// API (KAN-15 / contract C17). This is a STATIC SPA: it never talks to the
// database directly (see CLAUDE.md / DATABASE.md §1), so this file and
// ./portfolioClient.js must never contain a DB driver import, a connection
// string, or a DB credential env var -- only fetch() calls to backend HTTP
// endpoints.
//
// The base URL is a BUILD-TIME env var (CRA only inlines REACT_APP_-prefixed
// vars); with none set it defaults to same-origin ('').

const BASE_URL = process.env.REACT_APP_API_BASE_URL || ''

export class ApiError extends Error {
    constructor(message, status, body) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.body = body
    }
}

// Distinct type for a 409 optimistic-concurrency conflict (stale `version`)
// so callers can special-case "reload and retry" without string-matching.
export class VersionConflictError extends ApiError {
    constructor(message, body) {
        super(message, 409, body)
        this.name = 'VersionConflictError'
    }
}

export async function apiFetch(path, options = {}) {
    const { method = 'GET', body, headers } = options

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        // Sends the secure HttpOnly session cookie (C9) on every request;
        // this is the only form of auth the client carries.
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    })

    const text = await res.text()
    const data = text ? JSON.parse(text) : null

    if (!res.ok) {
        const message = (data && data.error) || `request failed with status ${res.status}`
        if (res.status === 409) {
            throw new VersionConflictError(message, data)
        }
        throw new ApiError(message, res.status, data)
    }

    return data
}
