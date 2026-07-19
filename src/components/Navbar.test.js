import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'
import { TRADE_URL } from '../services/uniswap'

const renderNavbar = () => render(
    <MemoryRouter>
        <Navbar />
    </MemoryRouter>
)

const getTradeLink = () => screen.getByRole('link', { name: /trade/i })

describe('Navbar Trade button', () => {
    it('renders and carries the correct href, target and rel attributes', () => {
        renderNavbar()

        const trade = getTradeLink()

        expect(trade).toBeInTheDocument()
        expect(trade.tagName).toBe('A')
        expect(trade).toHaveAttribute('href', TRADE_URL)
        expect(TRADE_URL).toBe('https://app.uniswap.org/explore')
        expect(trade).toHaveAttribute('target', '_blank')
        expect(trade).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders "Trade" as its visible label', () => {
        renderNavbar()

        expect(getTradeLink()).toHaveTextContent(/^Trade/)
    })

    it('announces that it opens in a new tab without overriding the accessible name', () => {
        renderNavbar()

        const trade = getTradeLink()

        expect(trade).not.toHaveAttribute('aria-label')
        expect(within(trade).getByText(/opens in new tab/i)).toBeInTheDocument()
        expect(trade).toHaveAccessibleName('Trade (opens in new tab)')
    })

    it('is a plain outbound anchor with no click handler', () => {
        renderNavbar()

        expect(getTradeLink()).not.toHaveAttribute('onclick')
    })

    it('is not nested inside the navbar title link to "/"', () => {
        renderNavbar()

        const trade = getTradeLink()
        const titleLink = screen.getByRole('link', { name: /coin search/i })

        expect(titleLink).toBeInTheDocument()
        expect(titleLink).toHaveAttribute('href', '/')
        expect(titleLink).not.toContainElement(trade)
        expect(within(titleLink).queryByRole('link', { name: /trade/i })).toBeNull()
    })
})
