import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import axios from 'axios'
import useMarketCoins from '../useMarketCoins'

// @testing-library/react 12 predates renderHook and react-hooks isn't a dep,
// so we exercise the hook through a tiny probe component + render/waitFor.
jest.mock('axios')

const MARKETS_URL =
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true'

function Probe() {
    const { data, isLoading, error, lastUpdated } = useMarketCoins()
    return (
        <div>
            <span data-testid='count'>{data.length}</span>
            <span data-testid='loading'>{String(isLoading)}</span>
            <span data-testid='error'>{error ? 'err' : 'none'}</span>
            <span data-testid='updated'>{lastUpdated ? 'set' : 'null'}</span>
        </div>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('useMarketCoins', () => {
    test('starts loading with empty data and no lastUpdated', () => {
        // Never resolves during this synchronous assertion window.
        axios.get.mockReturnValue(new Promise(() => {}))
        render(<Probe />)

        expect(screen.getByTestId('count')).toHaveTextContent('0')
        expect(screen.getByTestId('loading')).toHaveTextContent('true')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
        expect(screen.getByTestId('updated')).toHaveTextContent('null')
    })

    test('success: sets data and stamps lastUpdated, hitting the verbatim markets URL', async () => {
        axios.get.mockResolvedValue({ data: [{ id: 'bitcoin' }, { id: 'ethereum' }] })
        render(<Probe />)

        await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
        expect(axios.get).toHaveBeenCalledWith(MARKETS_URL)
        expect(screen.getByTestId('updated')).toHaveTextContent('set')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
    })

    test('failure: logs the error, data stays [] and lastUpdated stays null, nothing thrown', async () => {
        const err = new Error('network down')
        axios.get.mockRejectedValue(err)
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        // render must not throw when the fetch rejects.
        expect(() => render(<Probe />)).not.toThrow()

        await waitFor(() => expect(logSpy).toHaveBeenCalledWith(err))
        expect(screen.getByTestId('count')).toHaveTextContent('0')
        expect(screen.getByTestId('updated')).toHaveTextContent('null')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')

        logSpy.mockRestore()
    })
})
