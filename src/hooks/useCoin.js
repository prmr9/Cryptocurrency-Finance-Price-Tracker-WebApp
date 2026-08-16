// Data seam for the '/coin/:coinId' detail route (KAN-76). Extracts main's
// inline Coin.js fetch verbatim: same URL (via ../api/coingeckoClient), same
// swallowed failure (console.log(error)). `data` inits to `{}` so the nested
// optional-access guards in Coin.js (coin.image, coin.market_data?.*) behave
// identically before load. main fired on `[url]` where url = f(coinId); `[coinId]`
// is the same firing cardinality, so this adds no refetch main lacked.
// `isLoading`/`error` are exposed but no screen renders them in this story.

import { useState, useEffect } from 'react'
import { fetchCoin } from '../api/coingeckoClient'

export default function useCoin(coinId) {
    const [data, setData] = useState({})
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchCoin(coinId).then((coin) => {
            setData(coin)
            setIsLoading(false)
        }).catch((error) => {
            console.log(error)
            setError(error)
            setIsLoading(false)
        })
    }, [coinId])

    return { data, isLoading, error }
}
