import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'

const renderNavbar = () => render(
    <MemoryRouter>
        <Navbar />
    </MemoryRouter>
)

describe('Navbar Trade button', () => {
    it('renders the Trade button with the correct href, target and rel attributes', () => {
        renderNavbar()

        const trade = screen.getByRole('link', { name: /trade/i })

        expect(trade).toBeInTheDocument()
        expect(trade).toHaveAttribute('href', 'https://app.uniswap.org')
        expect(trade).toHaveAttribute('target', '_blank')
        expect(trade).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders a Trade link', () => {
        renderNavbar()
        expect(screen.getByRole('link', { name: /trade/i })).toBeInTheDocument()
    })

    it('points at the trading platform', () => {
        renderNavbar()
        expect(screen.getByRole('link', { name: /trade/i }))
            .toHaveAttribute('href', 'https://app.uniswap.org')
    })

    it('opens in a new tab', () => {
        renderNavbar()
        expect(screen.getByRole('link', { name: /trade/i }))
            .toHaveAttribute('target', '_blank')
    })

    it('sets rel="noopener noreferrer"', () => {
        renderNavbar()
        expect(screen.getByRole('link', { name: /trade/i }))
            .toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('announces that it opens in a new tab', () => {
        renderNavbar()
        expect(screen.getByRole('link', { name: /trade/i }))
            .toHaveAccessibleName(/opens in new tab/i)
    })

    it('is not nested inside the navbar title link to "/"', () => {
        renderNavbar()
        const trade = screen.getByRole('link', { name: /trade/i })
        const titleLink = screen.getByRole('link', { name: /coin search/i })

        expect(titleLink).toBeInTheDocument()
        expect(titleLink).toHaveAttribute('href', '/')
        expect(titleLink).not.toContainElement(trade)
        expect(within(titleLink).queryByRole('link', { name: /trade/i })).toBeNull()
    })
})
