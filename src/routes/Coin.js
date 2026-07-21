import axios from 'axios'
import { useParams, useNavigationType } from 'react-router-dom'
import React, { useState, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { track, resolveEntrySource } from '../services/analytics'

import './Coin.css'

const Coin = () => {

    const params = useParams()
    const navigationType = useNavigationType()
    const [coin, setCoin] = useState({})

    // Settled-load state for the KAN-8 coin_detail_viewed activation event. Starts
    // as 'loading' and moves to 'loaded' or 'error' once the per-coin fetch ends.
    const [detailLoad, setDetailLoad] = useState({ status: 'loading', loadMs: 0 })
    const detailViewedTracked = useRef(false)

    const url = `https://api.coingecko.com/api/v3/coins/${params.coinId}`


    useEffect(() => {
        const startedAt = Date.now()

        axios.get(url).then((res) => {
            setCoin(res.data)
            setDetailLoad({ status: 'loaded', loadMs: Date.now() - startedAt })
        }).catch((error) => {
            console.log(error)
            setDetailLoad({ status: 'error', loadMs: Date.now() - startedAt })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (detailViewedTracked.current) {
            return
        }

        // Hold the activation event until the per-coin fetch settles.
        if (detailLoad.status !== 'loaded' && detailLoad.status !== 'error') {
            return
        }

        detailViewedTracked.current = true
        track('coin_detail_viewed', {
            coin_id: params.coinId,
            coin_symbol: coin.symbol,
            source: resolveEntrySource(navigationType),
            load_ms: detailLoad.loadMs,
            load_status: detailLoad.status,
        })
        // Fire-once on load-settle; symbol/params/navType are read, not tracked.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailLoad.status, detailLoad.loadMs])

    return (
        <div>
            <div className='coin-container'>
                <div className='content'>
                    <h1>{coin.name}</h1>
                </div>
                <div className='content'>
                    <div className='rank'>
                        <span className='rank-btn'>Rank # {coin.market_cap_rank}</span>
                    </div>
                    <div className='info'>
                        <div className='coin-heading'>
                            {coin.image ? <img src={coin.image.small} alt='' /> : null}
                            <p>{coin.name}</p>
                            {coin.symbol ? <p>{coin.symbol.toUpperCase()}/USD</p> : null}

                        </div>
                        <div className='coin-price'>
                            {coin.market_data?.current_price ? <h1>${coin.market_data.current_price.usd.toLocaleString()}</h1> : null}
                        </div>
                    </div>
                </div>

                <div className='content'>
                    <table>
                        <thead>
                            <tr>
                                <th>1h</th>
                                <th>24h</th>
                                <th>7d</th>
                                <th>14d</th>
                                <th>30d</th>
                                <th>1yr</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>{coin.market_data?.price_change_percentage_1h_in_currency ? <p>{coin.market_data.price_change_percentage_1h_in_currency.usd.toFixed(1)}%</p> : null}</td>
                                <td>{coin.market_data?.price_change_percentage_24h_in_currency ? <p>{coin.market_data.price_change_percentage_24h_in_currency.usd.toFixed(1)}%</p> : null}</td>
                                <td>{coin.market_data?.price_change_percentage_24h_in_currency ? <p>{coin.market_data.price_change_percentage_7d_in_currency.usd.toFixed(1)}%</p> : null}</td>
                                <td>{coin.market_data?.price_change_percentage_24h_in_currency ? <p>{coin.market_data.price_change_percentage_14d_in_currency.usd.toFixed(1)}%</p> : null}</td>
                                <td>{coin.market_data?.price_change_percentage_24h_in_currency ? <p>{coin.market_data.price_change_percentage_30d_in_currency.usd.toFixed(1)}%</p> : null}</td>
                                <td>{coin.market_data?.price_change_percentage_24h_in_currency ? <p>{coin.market_data.price_change_percentage_1y_in_currency.usd.toFixed(1)}%</p> : null}</td>

                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className='content'>
                    <div className='stats'>
                        <div className='left'>
                            <div className='row'>
                                <h4>24 Hour Low</h4>
                                {coin.market_data?.low_24h ? <p>${coin.market_data.low_24h.usd.toLocaleString()}</p> : null}
                            </div>
                            <div className='row'>
                                <h4>24 Hour High</h4>
                                {coin.market_data?.high_24h ? <p>${coin.market_data.high_24h.usd.toLocaleString()}</p> : null}                            </div>

                        </div>
                        <div className='right'>
                            <div className='row'>
                                <h4>Market Cap</h4>
                                {coin.market_data?.market_cap ? <p>${coin.market_data.market_cap.usd.toLocaleString()}</p> : null}
                            </div>
                            <div className='row'>
                                <h4>Circulating Supply</h4>
                                {coin.market_data ? <p>{coin.market_data.circulating_supply}</p> : null}
                            </div>

                        </div>
                    </div>
                </div>

                <div className='content'>
                    <div className='about'>
                        <h3>About</h3>
                        <p className='coin-description' dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(coin.description ? coin.description.en : ''),
                        }}>

                        </p>

                    </div>
                </div>

            </div>
        </div>
    )
}

export default Coin
