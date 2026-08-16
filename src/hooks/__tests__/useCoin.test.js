import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import axios from 'axios'
import useCoin from '../useCoin'

// The axios module is mocked so no real network call happens and we control
// resolve/reject. The hook is exercised through a small probe component with
// render + waitFor and assertions on what the probe renders (the project runs
// @testing-library/react 12 and has no react-hooks helper dependency).
jest.mock('axios')

// Probe surfaces the whole hook return so tests can assert the raw values:
// `data` is exposed as JSON so "data stays {}" is checked literally.
function Probe({ coinId }) {
    const { data, isLoading, error } = useCoin(coinId)
    return (
        <div>
            <span data-testid='data'>{JSON.stringify(data)}</span>
            <span data-testid='name'>{data.name || 'none'}</span>
            <span data-testid='loading'>{String(isLoading)}</span>
            <span data-testid='error'>{error ? 'err' : 'none'}</span>
        </div>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('useCoin', () => {
    test('initial render: data is {} and no error while loading', () => {
        // A never-settling promise keeps the hook in its initial state.
        axios.get.mockReturnValue(new Promise(() => {}))
        render(<Probe coinId='bitcoin' />)

        expect(screen.getByTestId('data').textContent).toBe('{}')
        expect(screen.getByTestId('name')).toHaveTextContent('none')
        expect(screen.getByTestId('loading')).toHaveTextContent('true')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
    })

    test('success case: sets data from res.data, hitting the verbatim per-coin URL', async () => {
        const coin = { name: 'Bitcoin', symbol: 'btc' }
        axios.get.mockResolvedValue({ data: coin })
        render(<Probe coinId='bitcoin' />)

        await waitFor(() =>
            expect(screen.getByTestId('data').textContent).toBe(JSON.stringify(coin))
        )
        expect(screen.getByTestId('name')).toHaveTextContent('Bitcoin')
        expect(axios.get).toHaveBeenCalledWith('https://api.coingecko.com/api/v3/coins/bitcoin')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
    })

    test('failure case: console.log is called, data stays {}, and nothing is thrown', async () => {
        const err = new Error('network down')
        axios.get.mockRejectedValue(err)
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        // no thrown error: rendering while the fetch rejects must not throw.
        expect(() => render(<Probe coinId='bitcoin' />)).not.toThrow()

        // console.log called (verbatim, with the rejected error).
        await waitFor(() => expect(logSpy).toHaveBeenCalledWith(err))

        // data stays {}; the component is still mounted, i.e. the rejection did
        // not crash it.
        expect(screen.getByTestId('data').textContent).toBe('{}')
        expect(screen.getByTestId('name')).toHaveTextContent('none')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')

        logSpy.mockRestore()
    })
})
