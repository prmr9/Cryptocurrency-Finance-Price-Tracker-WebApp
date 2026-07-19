import React, { useState, useEffect } from 'react'
import {
    listAccounts,
    getActiveAccountId,
    addAccount,
    removeAccount,
    setActiveAccount
} from '../services/accountStore'
import { CHAIN_SLUGS, buildTradeUrl } from '../services/uniswap'
import './Accounts.css'

const CHAIN_OPTIONS = Object.keys(CHAIN_SLUGS).map((id) => ({
    id: Number(id),
    slug: CHAIN_SLUGS[id]
}))

const Accounts = () => {
    const [accounts, setAccounts] = useState([])
    const [activeAccountId, setActiveAccountIdState] = useState(null)
    const [label, setLabel] = useState('')
    const [address, setAddress] = useState('')
    const [chainId, setChainId] = useState(1)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        let alive = true

        Promise.all([listAccounts(), getActiveAccountId()])
            .then(([rows, active]) => {
                if (!alive) return
                setAccounts(rows)
                setActiveAccountIdState(active)
            })
            .catch(() => {
                if (!alive) return
                setAccounts([])
                setActiveAccountIdState(null)
            })
            .then(() => {
                if (alive) setLoading(false)
            })

        return () => {
            alive = false
        }
    }, [])

    const refresh = () =>
        Promise.all([listAccounts(), getActiveAccountId()]).then(([rows, active]) => {
            setAccounts(rows)
            setActiveAccountIdState(active)
        })

    const handleSubmit = (e) => {
        e.preventDefault()

        if (submitting) return

        setSubmitting(true)
        setError('')

        addAccount({ label, address, chainId })
            .then(() => {
                setLabel('')
                setAddress('')
                return refresh()
            })
            .catch((err) => {
                setError(err.message)
            })
            .then(() => {
                setSubmitting(false)
            })
    }

    const handleRemove = (id) => {
        setError('')
        removeAccount(id)
            .then(refresh)
            .catch((err) => setError(err.message))
    }

    const handleSetActive = (id) => {
        setError('')
        setActiveAccount(id)
            .then(refresh)
            .catch((err) => setError(err.message))
    }

    return (
        <div className='accounts container'>
            <h2>Accounts</h2>

            <p className='accounts-notice'>
                We store only a label and your public wallet address, in this browser. Never enter a
                private key, seed phrase or password here &mdash; no app should ever ask you for one.
                Trading happens on Uniswap, where you connect your own wallet.
            </p>

            <form className='accounts-form' onSubmit={handleSubmit}>
                <label htmlFor='account-label'>Label</label>
                <input
                    id='account-label'
                    type='text'
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder='Savings wallet'
                />

                <label htmlFor='account-address'>Public wallet address</label>
                <input
                    id='account-address'
                    type='text'
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder='0x...'
                />

                <label htmlFor='account-chain'>Network</label>
                <select
                    id='account-chain'
                    value={chainId}
                    onChange={(e) => setChainId(Number(e.target.value))}
                >
                    {CHAIN_OPTIONS.map((chain) => (
                        <option key={chain.id} value={chain.id}>
                            {chain.slug}
                        </option>
                    ))}
                </select>

                <button type='submit' className='accounts-submit' disabled={submitting}>
                    Add account
                </button>
            </form>

            {error ? (
                <p className='accounts-error' role='alert'>
                    {error}
                </p>
            ) : null}

            {loading ? <p className='accounts-empty'>Loading accounts&hellip;</p> : null}

            {!loading && accounts.length === 0 ? (
                <p className='accounts-empty'>No accounts yet. Add one above to get started.</p>
            ) : null}

            {accounts.length > 0 ? (
                <ul className='accounts-list'>
                    {accounts.map((account) => (
                        <li
                            key={account.id}
                            className={
                                account.id === activeAccountId
                                    ? 'accounts-row accounts-row-active'
                                    : 'accounts-row'
                            }
                        >
                            <span className='accounts-label'>{account.label}</span>
                            <span className='accounts-address'>{account.address}</span>
                            <span className='accounts-chain'>
                                {CHAIN_SLUGS[account.chainId] || 'unknown network'}
                            </span>
                            {account.id === activeAccountId ? (
                                <span className='accounts-active-badge'>Active</span>
                            ) : (
                                <button type='button' onClick={() => handleSetActive(account.id)}>
                                    Set active
                                </button>
                            )}
                            <a
                                className='trade-btn'
                                href={buildTradeUrl(account.chainId)}
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                Trade
                                <span className='sr-only'>
                                    {` with ${account.label} (opens in new tab)`}
                                </span>
                            </a>
                            <button
                                type='button'
                                className='accounts-remove'
                                onClick={() => handleRemove(account.id)}
                            >
                                Remove
                                <span className='sr-only'>{` account ${account.label}`}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

export default Accounts
