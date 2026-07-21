import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

// Pin TRADE_URL so the external-link assertion is deterministic and this test
// does not depend on the real uniswap service module.
jest.mock('../services/uniswap', () => ({
    TRADE_URL: 'https://app.uniswap.org/#/swap',
}))

import Footer from './Footer'

const renderFooter = () =>
    render(
        <MemoryRouter>
            <Footer />
        </MemoryRouter>
    )

describe('Footer', () => {
    test('happy path: renders brand, tagline, disclaimer and internal nav links', () => {
        renderFooter()
        expect(screen.getByText('CryptoTracker')).toBeInTheDocument()
        expect(screen.getByText(/Live cryptocurrency prices/i)).toBeInTheDocument()
        expect(screen.getByText(/not financial advice/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Prices' })).toHaveAttribute('href', '/')
        expect(screen.getByRole('link', { name: 'Watchlist' })).toHaveAttribute('href', '/accounts')
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    })

    test('edge case most likely to break: external Trade link uses TRADE_URL and opens safely in a new tab', () => {
        renderFooter()
        const trade = screen.getByRole('link', { name: /trade/i })
        expect(trade).toHaveAttribute('href', 'https://app.uniswap.org/#/swap')
        expect(trade).toHaveAttribute('target', '_blank')
        expect(trade).toHaveAttribute('rel', 'noopener noreferrer')
    })
})
