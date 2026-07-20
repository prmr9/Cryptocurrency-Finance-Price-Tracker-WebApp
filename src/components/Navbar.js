import React from 'react'
import {FaCoins} from 'react-icons/fa'
import {Link} from 'react-router-dom'
import { TRADE_URL } from '../services/uniswap'
import { track } from '../services/analytics'
import './Navbar.css'

const Navbar = () => {
    return (
        <header className='navbar'>
            <Link to='/' className='navbar-title'>
                <FaCoins className='icon' />
                <h1>CryptoTracker</h1>
            </Link>

            <nav className='navbar-links' aria-label='Primary'>
                <Link to='/' className='nav-link'>Prices</Link>
                <Link to='/accounts' className='nav-link'>Watchlist</Link>
                <Link to='/about' className='nav-link'>About</Link>
            </nav>

            <a
                className='trade-btn'
                href={TRADE_URL}
                target='_blank'
                rel='noopener noreferrer'
                onClick={() => track('trade_link_clicked', { destination_url: TRADE_URL })}
            >
                Trade<span className='sr-only'> (opens in new tab)</span>
            </a>
        </header>
    )
}

export default Navbar
