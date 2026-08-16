import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import axios from 'axios'
import useCoin from '../useCoin'

// @testing-library/react 12 predates renderHook and react-hooks isn't a dep,
// so we exercise the hook through a tiny probe component + render/waitFor.
jest.mock('axios')

function Probe({ coinId }) {
    const { data, isLoading, error } = useCoin(coinId)
    return (
        <div>
            <span data-testid='name'>{data.name || 'none'}</span>
            <span data-testid='keys'>{Object.keys(data).length}</span>
            <span data-testid='loading'>{String(isLoading)}</span>
            <span data-testid='error'>{error ? 'err' : 'none'}</span>
        </div>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('useCoin', () => {
    test('starts loading with an empty object and no error', () => {
        // Never resolves during this synchronous assertion window.
        axios.get.mockReturnValue(new Promise(() => {}))
        render(<Probe coinId='bitcoin' />)

        expect(screen.getByTestId('keys')).toHaveTextContent('0')
        expect(screen.getByTestId('name')).toHaveTextContent('none')
        expect(screen.getByTestId('loading')).toHaveTextContent('true')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
    })

    test('success: sets data, hitting the verbatim per-coin URL', async () => {
        axios.get.mockResolvedValue({ data: { name: 'Bitcoin', symbol: 'btc' } })
        render(<Probe coinId='bitcoin' />)

        await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Bitcoin'))
        expect(axios.get).toHaveBeenCalledWith('https://api.coingecko.com/api/v3/coins/bitcoin')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')
        expect(screen.getByTestId('error')).toHaveTextContent('none')
    })

    test('failure: logs the error, data stays {} , nothing thrown', async () => {
        const err = new Error('network down')
        axios.get.mockRejectedValue(err)
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        // render must not throw when the fetch rejects.
        expect(() => render(<Probe coinId='bitcoin' />)).not.toThrow()

        await waitFor(() => expect(logSpy).toHaveBeenCalledWith(err))
        expect(screen.getByTestId('keys')).toHaveTextContent('0')
        expect(screen.getByTestId('name')).toHaveTextContent('none')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')

        logSpy.mockRestore()
    })
})
