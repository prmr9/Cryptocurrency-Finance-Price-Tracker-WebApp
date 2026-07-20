import React from 'react'
import { Link } from 'react-router-dom'
import { TRADE_URL } from '../services/uniswap'

import './Footer.css'

const Footer = () => {
    return (
        <footer className='footer'>
            <div className='footer-inner'>
                <div className='footer-brand'>
                    <span className='footer-wordmark'>CryptoTracker</span>
                    <p className='footer-tagline'>Live cryptocurrency prices, powered by CoinGecko.</p>
                </div>

                <nav className='footer-links' aria-label='Footer'>
                    <Link to='/'>Prices</Link>
                    <Link to='/accounts'>Watchlist</Link>
                    <Link to='/about'>About</Link>
                    <a href={TRADE_URL} target='_blank' rel='noopener noreferrer'>
                        Trade<span className='sr-only'> (opens in new tab)</span>
                    </a>
                </nav>
            </div>

            <p className='footer-legal'>
                Market data is for informational purposes only and is not financial advice.
            </p>
        </footer>
    )
}

export default Footer
