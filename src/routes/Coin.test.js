import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import axios from 'axios'
import Coin from './Coin'

jest.mock('axios')

const renderCoinRoute = (coinId = 'bitcoin') =>
    render(
        <MemoryRouter initialEntries={[`/coin/${coinId}`]}>
            <Routes>
                <Route path='/coin/:coinId' element={<Coin />} />
            </Routes>
        </MemoryRouter>
    )

const fullCoin = {
    name: 'Bitcoin',
    symbol: 'btc',
    market_cap_rank: 1,
    image: { small: 'https://img/btc.png' },
    market_data: {
        current_price: { usd: 50000 },
        price_change_percentage_1h_in_currency: { usd: 0.1 },
        price_change_percentage_24h_in_currency: { usd: 2.5 },
        price_change_percentage_7d_in_currency: { usd: -3.4 },
        price_change_percentage_14d_in_currency: { usd: 5.1 },
        price_change_percentage_30d_in_currency: { usd: 10.9 },
        price_change_percentage_1y_in_currency: { usd: 120.4 },
    },
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('Coin route', () => {
    test('happy path: fetches the coin by id and renders its details', async () => {
        axios.get.mockResolvedValue({ data: fullCoin })
        renderCoinRoute('bitcoin')

        // name is rendered twice (heading + coin-heading) once data arrives
        expect(await screen.findAllByText('Bitcoin')).toHaveLength(2)
        expect(axios.get).toHaveBeenCalledWith(
            'https://api.coingecko.com/api/v3/coins/bitcoin'
        )
        expect(screen.getByText(/Rank # 1/)).toBeInTheDocument()
        expect(screen.getByText('BTC/USD')).toBeInTheDocument()
        expect(screen.getByText(/50,000/)).toBeInTheDocument()
        expect(screen.getByText('0.1%')).toBeInTheDocument()
        expect(screen.getByText('2.5%')).toBeInTheDocument()
    })

    test('edge case most likely to break: renders without crashing when image and market_data are absent', async () => {
        axios.get.mockResolvedValue({
            data: { name: 'Litecoin', symbol: 'ltc', market_cap_rank: 5 },
        })
        renderCoinRoute('litecoin')

        expect(await screen.findAllByText('Litecoin')).toHaveLength(2)
        expect(screen.getByText(/Rank # 5/)).toBeInTheDocument()
        expect(screen.getByText('LTC/USD')).toBeInTheDocument()
        // no market_data -> no price is rendered
        expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
    })

    test('error path: logs the error and renders no coin data when the request fails', async () => {
        const err = new Error('network down')
        axios.get.mockRejectedValue(err)
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        renderCoinRoute('bitcoin')

        await waitFor(() => expect(logSpy).toHaveBeenCalledWith(err))
        expect(screen.queryByText('Bitcoin')).not.toBeInTheDocument()

        logSpy.mockRestore()
    })
})
