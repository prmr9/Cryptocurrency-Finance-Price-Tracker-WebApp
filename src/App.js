import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Routes, Route } from 'react-router-dom'
import Coins from './components/Coins'
import Coin from './routes/Coin'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Accounts from './components/Accounts'
import About from './routes/About'


function App() {

  const [coins, setCoins] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false'

  useEffect(() => {
    // Single refresh path for the prices table. The success branch is the only
    // place lastUpdated is written, so a failed refresh leaves the previous good
    // timestamp untouched rather than blanking or misreporting freshness.
    const refreshPrices = () => {
      axios.get(url).then((response) => {
        setCoins(response.data)
        setLastUpdated(Date.now())
      }).catch((error) => {
        console.log(error)
      })
    }

    refreshPrices()
    const id = setInterval(refreshPrices, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <Navbar />
      <Routes>
        <Route path='/' element={<Coins coins={coins} lastUpdated={lastUpdated} />} />
        <Route path='/accounts' element={<Accounts />} />
        <Route path='/about' element={<About />} />
        <Route path='/coin' element={<Coin />}>
          <Route path=':coinId' element={<Coin />} />
        </Route>
      </Routes>
      <Footer />
    </>
  );
}

export default App;
