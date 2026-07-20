import React from 'react'
import { Link } from 'react-router-dom'
import { TRADE_URL } from '../services/uniswap'

import './About.css'

const About = () => {
    return (
        <div className='about-page'>
            <section className='about-hero'>
                <h2 className='about-title'>
                    About <span className='about-accent'>CryptoTracker</span>
                </h2>
                <p className='about-lead'>
                    CryptoTracker is a fast, no-nonsense way to follow the cryptocurrency
                    market. We surface live prices, market caps and 24-hour movements for
                    the top coins so you can see where the market stands at a glance.
                </p>
            </section>

            <section className='about-content'>
                <div className='about-card'>
                    <h3>Live market data</h3>
                    <p>
                        Prices and stats are pulled in real time from the CoinGecko API.
                        Open any coin to explore its price history, market data and a full
                        description.
                    </p>
                </div>
                <div className='about-card'>
                    <h3>Search the market</h3>
                    <p>
                        Filter the top coins by name or symbol to jump straight to the
                        asset you care about &mdash; no accounts or sign-in required.
                    </p>
                </div>
                <div className='about-card'>
                    <h3>Trade when you&rsquo;re ready</h3>
                    <p>
                        CryptoTracker is a tracker, not an exchange. When you want to
                        trade, we link you out to{' '}
                        <a href={TRADE_URL} target='_blank' rel='noopener noreferrer'>
                            Uniswap
                        </a>
                        , where you connect your own wallet.
                    </p>
                </div>
            </section>

            <p className='about-back'>
                <Link to='/'>&larr; Back to prices</Link>
            </p>
        </div>
    )
}

export default About
