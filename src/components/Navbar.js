import React, { useEffect } from 'react'
import {FaCoins} from 'react-icons/fa'
import {Link} from 'react-router-dom'
import { TRADE_URL } from '../services/uniswap'
import { track, noteInAppNavigation, flushAnalytics, getClientId, classifyReferrer, recordExposure } from '../services/analytics'
import './Navbar.css'

// The analytics module can be swapped for a partial stub that exposes only
// track(). A missing helper degrades to a neutral value rather than taking down
// the view it is instrumenting.
const callAnalytics = (fn, fallback, ...args) => (typeof fn === 'function' ? fn(...args) : fallback)

const Navbar = () => {
    // KAN-6: the navbar is the app's always-mounted entry surface, so it emits the
    // activation entry-point view once on mount. Every derived value degrades to a
    // neutral default when the analytics module is a track()-only stub.
    useEffect(() => {
        const exposure = callAnalytics(recordExposure, {}, 'navbar') || {}

        track('feature_entry_point_viewed', {
            user_id: callAnalytics(getClientId, null),
            surface: 'navbar',
            referrer: callAnalytics(
                classifyReferrer,
                'direct',
                typeof document !== 'undefined' ? document.referrer : '',
                typeof window !== 'undefined' ? window.location.origin : ''
            ),
            is_first_exposure: exposure.isFirstExposure === true
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleTradeClick = () => {
        track('trade_link_clicked', {
            source: 'navbar',
            account_id: null,
            destination_url: TRADE_URL,
            account_count: null
        })

        // This click can unload the document, so the sink is flushed rather than
        // left to a later tick that may never run.
        flushAnalytics()
    }

    // Clicking a router link is the only in-app navigation this app has, so it is
    // where the flag that lets resolveEntrySource/resolveEntryMethod tell a Back-
    // into-/accounts apart from a cold direct hit gets set.
    const handleInAppNav = () => {
        noteInAppNavigation()
    }

    return (
        <header className='navbar'>
            <Link to='/' className='navbar-title' onClick={handleInAppNav}>
                <FaCoins className='icon' />
                <h1>CryptoTracker</h1>
            </Link>

            <nav className='navbar-links' aria-label='Primary'>
                <Link to='/' className='nav-link' onClick={handleInAppNav}>Prices</Link>
                <Link to='/accounts' className='nav-link' onClick={handleInAppNav}>Watchlist</Link>
                <Link to='/about' className='nav-link' onClick={handleInAppNav}>About</Link>
            </nav>

            <a
                className='trade-btn'
                href={TRADE_URL}
                target='_blank'
                rel='noopener noreferrer'
                onClick={handleTradeClick}
            >
                Trade<span className='sr-only'> (opens in new tab)</span>
            </a>
        </header>
    )
}

export default Navbar
