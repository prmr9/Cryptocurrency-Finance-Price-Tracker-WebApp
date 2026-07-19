import React, { useEffect, useRef } from 'react'
import {FaCoins} from 'react-icons/fa'
import {Link} from 'react-router-dom'
import { track, trackOnce, recordTradeClickDay } from '../analytics'
import './Navbar.css'

const TRADE_URL = 'https://app.uniswap.org'

const VIEWED_ONCE_KEY = 'navbar_trade_link_viewed'
const PENDING_RETURN_KEY = 'kan2.pending_trade_return'
const RETURN_WINDOW_SECONDS = 900

const secondsSincePageLoad = () => {
    try {
        return Math.round(performance.now() / 1000)
    } catch (error) {
        console.log(error)
        return 0
    }
}

const Navbar = () => {
    const navbarRef = useRef(null)
    const tradeRef = useRef(null)

    // navbar_trade_link_viewed — first time the Trade anchor is actually in the
    // viewport this session. Guarded through trackOnce, so StrictMode's
    // double-invoked effects cannot double-count it.
    useEffect(() => {
        const anchor = tradeRef.current

        const emitViewed = () => trackOnce(VIEWED_ONCE_KEY, 'navbar_trade_link_viewed', {
            viewport_width: window.innerWidth,
        })

        if (!anchor || typeof IntersectionObserver !== 'function') {
            emitViewed()
            return undefined
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                emitViewed()
                observer.disconnect()
            }
        })

        observer.observe(anchor)

        return () => observer.disconnect()
    }, [])

    // navbar_trade_link_clicked — delegated on the navbar container rather than
    // a click-handler prop on the anchor (ticket constraint). `click` covers mouse
    // and keyboard Enter; `auxclick` covers middle-click. The two never fire for
    // the same activation, so each activation emits exactly once.
    useEffect(() => {
        const container = navbarRef.current

        if (!container) {
            return undefined
        }

        const emitClick = (event, activationMethod) => {
            const anchor = event.target && event.target.closest
                ? event.target.closest('.trade-btn')
                : null

            if (!anchor || !container.contains(anchor)) {
                return
            }

            const properties = {
                trade_url: anchor.getAttribute('href'),
                link_target: anchor.getAttribute('target'),
                activation_method: activationMethod,
                seconds_since_page_load: secondsSincePageLoad(),
            }

            track('navbar_trade_link_clicked', properties)

            const repeat = recordTradeClickDay(new Date())

            if (repeat) {
                track('trade_link_repeat_used', repeat)
            }

            // Only foreground-opening activations hand the tab away, so only
            // those can meaningfully "return". A middle-click opens a
            // background tab and never leaves this one.
            if (activationMethod !== 'middle_click') {
                try {
                    window.sessionStorage.setItem(PENDING_RETURN_KEY, String(Date.now()))
                } catch (error) {
                    console.log(error)
                }
            }
        }

        const handleClick = (event) => {
            if (event.button && event.button !== 0) {
                return
            }

            emitClick(event, event.detail === 0 ? 'keyboard' : 'mouse_click')
        }

        const handleAuxClick = (event) => {
            if (event.button !== 1) {
                return
            }

            emitClick(event, 'middle_click')
        }

        container.addEventListener('click', handleClick)
        container.addEventListener('auxclick', handleAuxClick)

        return () => {
            container.removeEventListener('click', handleClick)
            container.removeEventListener('auxclick', handleAuxClick)
        }
    }, [])

    // trade_link_returned_to_app — this tab regains focus after a Trade click.
    // Requires an explicit pending flag, is bounded to RETURN_WINDOW_SECONDS,
    // and clears the flag so it fires at most once per click.
    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') {
                return
            }

            let stamp = null

            try {
                stamp = window.sessionStorage.getItem(PENDING_RETURN_KEY)
                window.sessionStorage.removeItem(PENDING_RETURN_KEY)
            } catch (error) {
                console.log(error)
            }

            if (!stamp) {
                return
            }

            const secondsAway = Math.round((Date.now() - Number(stamp)) / 1000)

            if (!Number.isFinite(secondsAway) || secondsAway < 0 || secondsAway > RETURN_WINDOW_SECONDS) {
                return
            }

            track('trade_link_returned_to_app', { seconds_away: secondsAway })
        }

        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => document.removeEventListener('visibilitychange', onVisibilityChange)
    }, [])

    return (
        <div className='navbar' ref={navbarRef}>
            <Link to='/' className='navbar-title'>
                <FaCoins className='icon' />
                <h1> Coin <span className='purple'>Search</span></h1>
            </Link>
            <a
                ref={tradeRef}
                className='trade-btn'
                href={TRADE_URL}
                target='_blank'
                rel='noopener noreferrer'
            >
                Trade<span className='sr-only'> (opens in new tab)</span>
            </a>
        </div>
    )
}

export default Navbar
