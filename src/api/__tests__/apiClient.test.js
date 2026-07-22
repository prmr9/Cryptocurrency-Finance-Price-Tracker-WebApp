import { apiFetch, ApiError, VersionConflictError } from '../apiClient'

function mockFetchOnce({ status, body }) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => (body === undefined ? '' : JSON.stringify(body))
    })
}

afterEach(() => {
    delete global.fetch
})

describe('apiFetch', () => {
    test('sends credentials: include and a JSON content-type header', async () => {
        mockFetchOnce({ status: 200, body: { ok: true } })

        await apiFetch('/portfolios')

        expect(global.fetch).toHaveBeenCalledTimes(1)
        const [, options] = global.fetch.mock.calls[0]
        expect(options.credentials).toBe('include')
        expect(options.headers['Content-Type']).toBe('application/json')
    })

    test('JSON-serializes a request body', async () => {
        mockFetchOnce({ status: 200, body: {} })

        await apiFetch('/portfolios', { method: 'PUT', body: { name: 'default', holdings: [] } })

        const [, options] = global.fetch.mock.calls[0]
        expect(options.method).toBe('PUT')
        expect(JSON.parse(options.body)).toEqual({ name: 'default', holdings: [] })
    })

    test('returns the parsed JSON body on a 2xx response', async () => {
        mockFetchOnce({ status: 200, body: { portfolios: [] } })

        const result = await apiFetch('/portfolios')

        expect(result).toEqual({ portfolios: [] })
    })

    test('throws ApiError on a non-2xx, non-409 response', async () => {
        mockFetchOnce({ status: 400, body: { error: 'bad request' } })

        await expect(apiFetch('/portfolios', { method: 'PUT', body: {} })).rejects.toThrow(ApiError)
    })

    test('throws a distinct VersionConflictError on 409', async () => {
        mockFetchOnce({ status: 409, body: { error: 'version_conflict', currentVersion: 3 } })

        await expect(apiFetch('/portfolios', { method: 'PUT', body: {} })).rejects.toThrow(VersionConflictError)
    })
})
