import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'

const TRADE_URL = 'https://app.uniswap.org'

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
        expect(trade).toHaveAttribute('href', 'https://app.uniswap.org')
        expect(trade).toHaveAttribute('target', '_blank')
        expect(trade).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders the Trade button pointing at the trading platform', () => {
        renderNavbar()

        const trade = getTradeLink()

        expect(trade).toBeInTheDocument()
        expect(trade).toHaveAttribute('href', TRADE_URL)
    })

    it('opens the trading platform in a new tab', () => {
        renderNavbar()

        expect(getTradeLink()).toHaveAttribute('target', '_blank')
    })

    it('sets rel containing both noopener and noreferrer', () => {
        renderNavbar()

        const rel = getTradeLink().getAttribute('rel')

        expect(rel).toEqual(expect.stringContaining('noopener'))
        expect(rel).toEqual(expect.stringContaining('noreferrer'))
        expect(getTradeLink()).toHaveAttribute(
            'rel',
            expect.stringContaining('noopener')
        )
        expect(getTradeLink()).toHaveAttribute(
            'rel',
            expect.stringContaining('noreferrer')
        )
    })

    it('announces that it opens in a new tab', () => {
        renderNavbar()

        expect(getTradeLink()).toHaveAccessibleName(/opens in new tab/i)
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
