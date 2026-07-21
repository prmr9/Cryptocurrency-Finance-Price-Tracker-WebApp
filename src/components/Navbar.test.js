import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'
import { TRADE_URL } from '../services/uniswap'
import {
    getTrackedEventsForTest,
    hasNavigatedInApp,
    resolveEntrySource
} from '../services/analytics'

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

    // KAN-5 deliberately replaces the previous "no click handler" assertion: the
    // anchor now reports the click before the browser follows it. What still has
    // to hold is that instrumentation is additive — the navigation itself is
    // untouched, so the anchor keeps working with JS handlers that never fire.
    it('reports the click without taking over the navigation', () => {
        renderNavbar()

        const trade = getTradeLink()

        // no inline handler and no href rewriting: the browser still owns the nav
        expect(trade).not.toHaveAttribute('onclick')
        expect(trade).toHaveAttribute('href', TRADE_URL)

        userEvent.click(trade)

        const clicks = getTrackedEventsForTest().filter(
            (event) => event.event === 'trade_link_clicked'
        )

        expect(clicks).toHaveLength(1)
        expect(clicks[0].properties.source).toBe('navbar')
        expect(clicks[0].properties.destination_url).toBe(TRADE_URL)
    })

    it('is not nested inside the navbar title link to "/"', () => {
        renderNavbar()

        const trade = getTradeLink()
        const titleLink = screen.getByRole('link', { name: /cryptotracker/i })

        expect(titleLink).toBeInTheDocument()
        expect(titleLink).toHaveAttribute('href', '/')
        expect(titleLink).not.toContainElement(trade)
        expect(within(titleLink).queryByRole('link', { name: /trade/i })).toBeNull()
    })
})

describe('Navbar Accounts link', () => {
    it('routes to /accounts', () => {
        renderNavbar()

        expect(screen.getByRole('link', { name: /watchlist/i })).toHaveAttribute(
            'href',
            '/accounts'
        )
    })

    // Clicking a router link is the only in-app navigation this app has, so it is
    // what has to flip the flag resolveEntrySource keys off. Asserted through the
    // observable consequence rather than a spy: before the click a POP is a cold
    // direct hit, after it the same POP is Back within the app.
    it('records the in-app navigation so a later POP reads as browser history', () => {
        renderNavbar()

        expect(hasNavigatedInApp()).toBe(false)
        expect(resolveEntrySource('POP')).toBe('direct_url')

        userEvent.click(screen.getByRole('link', { name: /watchlist/i }))

        expect(hasNavigatedInApp()).toBe(true)
        expect(resolveEntrySource('POP')).toBe('browser_history')
    })
})
