import axios from 'axios'
import { fetchMarketCoins, fetchCoin } from '../coingeckoClient'

jest.mock('axios')

beforeEach(() => {
    jest.clearAllMocks()
})

describe('coingeckoClient', () => {
    test('fetchMarketCoins GETs the verbatim markets URL and returns res.data', async () => {
        const rows = [{ id: 'bitcoin' }, { id: 'ethereum' }]
        axios.get.mockResolvedValue({ data: rows })

        const result = await fetchMarketCoins()

        expect(axios.get).toHaveBeenCalledWith(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true'
        )
        expect(result).toBe(rows)
    })

    test('fetchCoin GETs the verbatim per-coin URL and returns res.data', async () => {
        const coin = { name: 'Bitcoin' }
        axios.get.mockResolvedValue({ data: coin })

        const result = await fetchCoin('bitcoin')

        expect(axios.get).toHaveBeenCalledWith('https://api.coingecko.com/api/v3/coins/bitcoin')
        expect(result).toBe(coin)
    })
})
