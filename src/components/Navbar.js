import React from 'react'
import {FaCoins} from 'react-icons/fa'
import {Link} from 'react-router-dom'
import './Navbar.css'

const TRADE_URL = 'https://app.uniswap.org'

const Navbar = () => {
    return (
        <div className='navbar'>
            <Link to='/' className='navbar-title'>
                <FaCoins className='icon' />
                <h1> Coin <span className='purple'>Search</span></h1>
            </Link>
            <a
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
