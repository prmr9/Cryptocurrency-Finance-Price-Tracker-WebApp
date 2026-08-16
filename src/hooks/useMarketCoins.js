// Data seam for the '/' market table (KAN-76). Extracts main's inline App.js
// fetch verbatim: same URL (via ../api/coingeckoClient), same empty-dep-array
// single fire, same success order (data then lastUpdated), same swallowed
// failure (console.log(error), nothing rendered). `error` is exposed for
// future screens but no screen renders it in this story.

import { useState, useEffect } from 'react'
import { fetchMarketCoins } from '../api/coingeckoClient'

export default function useMarketCoins() {
    const [data, setData] = useState([])
    const [lastUpdated, setLastUpdated] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchMarketCoins().then((coins) => {
            setData(coins)
            setLastUpdated(new Date())
            setIsLoading(false)
        }).catch((error) => {
            console.log(error)
            setError(error)
            setIsLoading(false)
        })
    }, [])

    return { data, isLoading, error, lastUpdated }
}
