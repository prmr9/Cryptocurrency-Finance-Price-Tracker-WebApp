import { getPortfolios, putPortfolio, importLocalData } from '../portfolioClient'

function mockFetchOnce(body) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body)
    })
}

afterEach(() => {
    delete global.fetch
})

describe('portfolioClient', () => {
    test('getPortfolios GETs /portfolios and returns the portfolios array', async () => {
        mockFetchOnce({ portfolios: [{ name: 'default', holdings: [] }] })

        const portfolios = await getPortfolios()

        expect(portfolios).toEqual([{ name: 'default', holdings: [] }])
        const [url, options] = global.fetch.mock.calls[0]
        expect(url).toMatch(/\/portfolios$/)
        expect(options.method).toBe('GET')
    })

    test('putPortfolio PUTs name/holdings/version to /portfolios', async () => {
        mockFetchOnce({ name: 'default', holdings: [{ symbol: 'BTC', shares: 1 }], version: 2 })

        await putPortfolio('default', [{ symbol: 'BTC', shares: 1 }], 1)

        const [url, options] = global.fetch.mock.calls[0]
        expect(url).toMatch(/\/portfolios$/)
        expect(options.method).toBe('PUT')
        expect(JSON.parse(options.body)).toEqual({
            name: 'default',
            holdings: [{ symbol: 'BTC', shares: 1 }],
            version: 1
        })
    })

    test('importLocalData POSTs to /me/import and returns the imported holdings', async () => {
        mockFetchOnce({ imported: { default: [{ symbol: 'BTC', shares: 1 }], watchlist: [] } })

        const imported = await importLocalData({ default: [{ symbol: 'BTC', shares: 1 }], watchlist: [] })

        expect(imported).toEqual({ default: [{ symbol: 'BTC', shares: 1 }], watchlist: [] })
        const [url, options] = global.fetch.mock.calls[0]
        expect(url).toMatch(/\/me\/import$/)
        expect(options.method).toBe('POST')
    })
})
