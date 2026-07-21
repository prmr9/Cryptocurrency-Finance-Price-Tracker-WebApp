import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Routes, Route } from 'react-router-dom'
import Coins from './components/Coins'
import Coin from './routes/Coin'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Accounts from './components/Accounts'
import About from './routes/About'
import { track, touchSession, getVisitContext, recordVisit } from './services/analytics'


function App() {

  const [coins, setCoins] = useState([])

  // Settled fetch outcome for the top-50 list, injected into the Prices route so
  // Coins can emit prices_viewed keyed on load-SETTLED (loaded OR error) rather
  // than on a non-empty row count. Starts 'loading' until the axios fetch ends.
  const [pricesLoad, setPricesLoad] = useState({ status: 'loading', loadMs: 0, count: 0 })

  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false'

  useEffect(() => {
    const startedAt = Date.now()

    axios.get(url).then((response) => {
      setCoins(response.data)
      setPricesLoad({
        status: 'loaded',
        loadMs: Date.now() - startedAt,
        count: Array.isArray(response.data) ? response.data.length : 0
      })
      // console.log(response.data[0])
    }).catch((error) => {
      console.log(error)
      setPricesLoad({ status: 'error', loadMs: Date.now() - startedAt, count: 0 })
    })
  }, [])

  // KAN-8 retention: runs once on App mount regardless of route or fetch outcome,
  // so entry point never biases return-visit measurement. Order is read -> emit
  // -> record, so is_new_session is evaluated against the stored session before
  // recordVisit() advances it. touchSession() first ensures the live session id
  // is current (a new session after 30m idle) so a genuine return is detected.
  useEffect(() => {
    touchSession()
    const visit = getVisitContext()
    if (!visit.is_first_visit && visit.is_new_session) {
      track('prices_return_visit', {
        days_since_last_visit: visit.days_since_last_visit,
        visit_count: visit.visit_count
      })
    }
    recordVisit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Navbar />
      <Routes>
        <Route path='/' element={<Coins coins={coins} loadState={pricesLoad} />} />
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
