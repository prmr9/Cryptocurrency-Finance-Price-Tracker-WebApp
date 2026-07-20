import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import Coins from './Coins'

// Isolate the search/filter logic under test: stub the row renderer and the
// lazily-referenced Coin route so we don't pull in axios/DOMPurify here.
jest.mock('./CoinItem', () => (props) => (
    <div data-testid='coin-item'>{props.coins.name} ({props.coins.symbol})</div>
))
jest.mock('../routes/Coin', () => () => null)

const coins = [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', current_price: 50000 },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', current_price: 3000 },
    { id: 'cardano', name: 'Cardano', symbol: 'ADA', current_price: 1 },
]

const renderCoins = (props = {}) =>
    render(
        <MemoryRouter>
            <Coins coins={coins} {...props} />
        </MemoryRouter>
    )

const searchBox = () => screen.getByRole('textbox', { name: /search coins/i })

describe('Coins search', () => {
    test('happy path: renders every coin when the query is empty', () => {
        renderCoins()
        expect(screen.getAllByTestId('coin-item')).toHaveLength(3)
        expect(screen.getByText(/Bitcoin/)).toBeInTheDocument()
        expect(screen.getByText(/Ethereum/)).toBeInTheDocument()
        expect(screen.getByText(/Cardano/)).toBeInTheDocument()
    })

    test('filters by name, case-insensitively', () => {
        renderCoins()
        fireEvent.change(searchBox(), { target: { value: 'ETHER' } })
        expect(screen.getAllByTestId('coin-item')).toHaveLength(1)
        expect(screen.getByText(/Ethereum/)).toBeInTheDocument()
        expect(screen.queryByText(/Bitcoin/)).not.toBeInTheDocument()
    })

    test('matches on symbol when the name does not contain the query', () => {
        renderCoins()
        fireEvent.change(searchBox(), { target: { value: 'ada' } })
        expect(screen.getAllByTestId('coin-item')).toHaveLength(1)
        expect(screen.getByText(/Cardano/)).toBeInTheDocument()
    })

    test('edge case most likely to break: surrounding whitespace is trimmed before matching', () => {
        renderCoins()
        fireEvent.change(searchBox(), { target: { value: '   bitcoin   ' } })
        expect(screen.getAllByTestId('coin-item')).toHaveLength(1)
        expect(screen.getByText(/Bitcoin/)).toBeInTheDocument()
    })

    test('empty/error path: shows the no-match message (with the trimmed query) and no rows', () => {
        renderCoins()
        fireEvent.change(searchBox(), { target: { value: '  dogecoin  ' } })
        expect(screen.queryByTestId('coin-item')).not.toBeInTheDocument()
        const empty = screen.getByText(/No coins in the top 50 match/i)
        expect(empty).toBeInTheDocument()
        expect(empty).toHaveTextContent('dogecoin')
    })
})
