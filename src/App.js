import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Coins from './components/Coins'
import Coin from './routes/Coin'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Accounts from './components/Accounts'
import About from './routes/About'
import useMarketCoins from './hooks/useMarketCoins'


function App() {

  const { data: coins, lastUpdated } = useMarketCoins();

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
