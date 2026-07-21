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
  const [loadMs, setLoadMs] = useState()

  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false'

  useEffect(() => {
    const t0 = performance.now()
    axios.get(url).then((response) => {
      setCoins(response.data)
      setLoadMs(Math.round(performance.now() - t0))
      // console.log(response.data[0])
    }).catch((error) => {
      console.log(error)
    })
  }, [])

  return (
    <>
      <Navbar />
      <Routes>
        <Route path='/' element={<Coins coins={coins} loadMs={loadMs} />} />
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
