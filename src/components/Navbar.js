import React from 'react'
import {FaCoins} from 'react-icons/fa'
import {Link} from 'react-router-dom'
import { TRADE_URL } from '../services/uniswap'
import { track, noteInAppNavigation, flushAnalytics } from '../services/analytics'
import './Navbar.css'

const Navbar = () => {
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

    return (
        <div className='navbar'>
            <Link to='/' className='navbar-title' onClick={() => noteInAppNavigation()}>
                <FaCoins className='icon' />
                <h1> Coin <span className='purple'>Search</span></h1>
            </Link>
            {/*
              Clicking a router link is the only in-app navigation this app has, so
              it is where the flag that lets resolveEntrySource tell Back-into-
              /accounts apart from a cold direct hit gets set.
            */}
            <Link
                to='/accounts'
                className='navbar-accounts'
                onClick={() => noteInAppNavigation()}
            >
                Accounts
            </Link>
            <a
                className='trade-btn'
                href={TRADE_URL}
                target='_blank'
                rel='noopener noreferrer'
                onClick={handleTradeClick}
            >
                Trade<span className='sr-only'> (opens in new tab)</span>
            </a>
        </div>
    )
}

export default Navbar
