import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import axios from 'axios'
import useMarketCoins from '../useMarketCoins'

// The axios module is mocked so no real network call happens and we control
// resolve/reject. @testing-library/react 12 predates renderHook and
// react-hooks isn't a dep, so we drive the hook through a tiny probe
// component with render/waitFor (NOT renderHook).
jest.mock('axios')

const MARKETS_URL =
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true'

// Probe surfaces the whole hook return so tests can assert the raw values:
// `data` is exposed as JSON so "data stays []" is checked literally, not via a
// derived length.
function Probe() {
    const { data, isLoading, error, lastUpdated } = useMarketCoins()
    return (
        <div>
            <span data-testid='data'>{JSON.stringify(data)}</span>
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
    test('initial render: data is [] and lastUpdated is null while loading', () => {
        // A never-settling promise keeps the hook in its initial state.
        axios.get.mockReturnValue(new Promise(() => {}))
        render(<Probe />)

        expect(screen.getByTestId('data').textContent).toBe('[]')
        expect(screen.getByTestId('loading')).toHaveTextContent('true')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
        expect(screen.getByTestId('updated')).toHaveTextContent('null')
    })

    test('success case: sets data from res.data and stamps lastUpdated, hitting the verbatim markets URL', async () => {
        const rows = [{ id: 'bitcoin' }, { id: 'ethereum' }]
        axios.get.mockResolvedValue({ data: rows })
        render(<Probe />)

        await waitFor(() =>
            expect(screen.getByTestId('data').textContent).toBe(JSON.stringify(rows))
        )
        expect(axios.get).toHaveBeenCalledWith(MARKETS_URL)
        expect(screen.getByTestId('updated')).toHaveTextContent('set')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
    })

    test('failure case: console.log is called, data stays [], and nothing is thrown', async () => {
        const err = new Error('network down')
        axios.get.mockRejectedValue(err)
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        // no thrown error: rendering while the fetch rejects must not throw.
        expect(() => render(<Probe />)).not.toThrow()

        // console.log called (verbatim, with the rejected error).
        await waitFor(() => expect(logSpy).toHaveBeenCalledWith(err))

        // data stays [] and lastUpdated stays null (never replaced on failure);
        // the component is still mounted, i.e. the rejection did not crash it.
        expect(screen.getByTestId('data').textContent).toBe('[]')
        expect(screen.getByTestId('updated')).toHaveTextContent('null')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')

        logSpy.mockRestore()
    })
})
