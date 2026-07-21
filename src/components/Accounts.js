import React, { useState, useEffect, useRef } from 'react'
import { useNavigationType } from 'react-router-dom'
import {
    listAccounts,
    getActiveAccountId,
    addAccount,
    removeAccount,
    setActiveAccount
} from '../services/accountStore'
import { CHAIN_SLUGS, buildTradeUrl } from '../services/uniswap'
import {
    track,
    touchSession,
    flushAnalytics,
    resolveEntrySource,
    classifyAddressFormat,
    noteAccountFirstSeen,
    notePreexistingAccounts,
    getRetentionContext,
    getAccountAgeDays
} from '../services/analytics'
import './Accounts.css'

const CHAIN_OPTIONS = Object.keys(CHAIN_SLUGS).map((id) => ({
    id: Number(id),
    slug: CHAIN_SLUGS[id]
}))

// The store rejects with user-facing prose. Analytics needs a stable machine
// code that survives copy edits, plus the field the error belongs to.
const classifyStoreError = (message) => {
    const text = typeof message === 'string' ? message : ''

    if (/label is required/i.test(text)) {
        return { code: 'label_required', field: 'label' }
    }

    if (/valid public wallet address/i.test(text)) {
        return { code: 'address_invalid', field: 'address' }
    }

    if (/already been added/i.test(text)) {
        return { code: 'address_duplicate', field: 'address' }
    }

    if (/could not save/i.test(text)) {
        return { code: 'storage_unavailable', field: null }
    }

    return { code: 'unknown', field: null }
}

// The analytics module can be swapped for a partial stub that exposes only
// track(). A missing helper degrades to a neutral value rather than taking down
// the view it is instrumenting.
const callAnalytics = (fn, fallback, ...args) => (typeof fn === 'function' ? fn(...args) : fallback)

// address_format is the only address-derived signal the funnel event carries, so
// it must still classify when the analytics module is a partial stub that omits
// the shared helper. Mirrors classifyAddressFormat() in services/analytics.
const classifyAddressShape = (address) => {
    if (typeof address !== 'string') {
        return 'empty'
    }

    const trimmed = address.trim()

    if (trimmed.length === 0) {
        return 'empty'
    }

    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        return 'evm_hex_42'
    }

    if (/^[0-9a-fA-F]{40}$/.test(trimmed)) {
        return 'evm_hex_40_no_prefix'
    }

    const body = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed

    if (!/^[0-9a-fA-F]*$/.test(body)) {
        return 'non_hex'
    }

    return body.length < 40 ? 'too_short' : 'too_long'
}

const Accounts = () => {
    const [accounts, setAccounts] = useState([])
    const [activeAccountId, setActiveAccountIdState] = useState(null)
    const [label, setLabel] = useState('')
    const [address, setAddress] = useState('')
    const [chainId, setChainId] = useState(1)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    const navigationType = useNavigationType()

    // Add-account attempts are counted per successful add, so a user who fixes a
    // typo reports attempts_before_success: 1 rather than starting over at 0.
    const attemptsRef = useRef(0)
    const firstAttemptAtRef = useRef(null)

    // KAN-6 feature_action_submitted needs time_to_submit_ms: how long the user
    // spent in the form before submitting. Stamped the first time either field
    // changes, so it measures real interaction time rather than mount-to-submit.
    const formStartedAtRef = useRef(null)

    const noteFormStarted = () => {
        if (formStartedAtRef.current === null) {
            formStartedAtRef.current = Date.now()
        }
    }

    useEffect(() => {
        let alive = true

        // A sink that is stubbed out (or swapped for one that omits the session
        // helpers) must not take the view down on mount.
        const session = callAnalytics(touchSession, null) || {}

        const openView = (rows, active) => {
            // Accounts already on disk predate instrumentation: marking them keeps
            // them from later reporting a fabricated age.
            callAnalytics(
                notePreexistingAccounts,
                [],
                rows.map((account) => account.id)
            )

            track('accounts_view_opened', {
                entry_source: callAnalytics(resolveEntrySource, 'direct_url', navigationType),
                existing_account_count: rows.length,
                is_first_visit: (session.sessionCount || 0) <= 1
            })

            const retention = callAnalytics(getRetentionContext, null) || {}

            if (retention.isReturning) {
                track('accounts_returned', {
                    account_count: rows.length,
                    active_account_id: active,
                    days_since_first_account: retention.daysSinceFirstAccount,
                    sessions_since_first_account: retention.sessionsSinceFirstAccount
                })
            }
        }

        Promise.all([listAccounts(), getActiveAccountId()])
            .then(([rows, active]) => {
                if (!alive) return
                setAccounts(rows)
                setActiveAccountIdState(active)
                openView(rows, active)
            })
            .catch(() => {
                if (!alive) return
                setAccounts([])
                setActiveAccountIdState(null)
                openView([], null)
            })
            .then(() => {
                if (alive) setLoading(false)
            })

        return () => {
            alive = false
        }
        // Mount-only: this is the view-opened event, not a re-render event.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

        attemptsRef.current += 1

        const attemptNumber = attemptsRef.current
        const previousActiveId = activeAccountId
        const countBefore = accounts.length

        if (firstAttemptAtRef.current === null) {
            firstAttemptAtRef.current = Date.now()
        }

        // Emitted before validation resolves, so the denominator of the funnel is
        // every submission rather than only the ones that succeed. The address
        // itself never leaves the component — only its shape, so the format enum
        // is the only address-derived signal on the event.
        const timeToSubmitMs =
            formStartedAtRef.current !== null
                ? Math.max(0, Date.now() - formStartedAtRef.current)
                : 0

        track('add_account_submitted', {
            label_provided: label.trim().length > 0,
            address_format: callAnalytics(classifyAddressFormat, classifyAddressShape(address), address),
            existing_account_count: countBefore,
            time_to_submit_ms: timeToSubmitMs
        })

        addAccount({
            label,
            address,
            chainId
        })
            .then((account) => {
                callAnalytics(noteAccountFirstSeen, null, account.id)
                setLabel('')
                setAddress('')

                // account_added is emitted here, from the view, once the store has
                // committed the persist. attempts_before_success and time_to_add_ms
                // are interaction facts the store cannot know, so the view owns them.
                track('account_added', {
                    account_id: account.id,
                    account_count_after: countBefore + 1,
                    is_first_account: countBefore === 0,
                    attempts_before_success: attemptNumber - 1,
                    time_to_add_ms:
                        typeof firstAttemptAtRef.current === 'number'
                            ? Date.now() - firstAttemptAtRef.current
                            : 0
                })

                // The store promotes the first account automatically; anything else
                // leaves the existing pointer alone.
                if (previousActiveId === null) {
                    track('account_activated', {
                        account_id: account.id,
                        account_count: countBefore + 1,
                        was_auto_selected: true,
                        previous_active_account_id: null
                    })
                }

                attemptsRef.current = 0
                firstAttemptAtRef.current = null
                formStartedAtRef.current = null

                return refresh()
            })
            .catch((err) => {
                setError(err.message)

                const classified = classifyStoreError(err.message)

                track('add_account_validation_failed', {
                    error_code: classified.code,
                    error_message: err.message,
                    field: classified.field,
                    attempt_number: attemptNumber
                })
            })
            .then(() => {
                setSubmitting(false)
            })
    }

    const handleRemove = (id) => {
        setError('')

        // Captured from the row as it stands before the delete: whether it was the
        // active pointer, its age from the first-seen ledger, and the surviving count.
        const wasActive = activeAccountId === id
        const accountAgeDays = callAnalytics(getAccountAgeDays, null, id)
        const countAfter = accounts.filter((a) => a.id !== id).length

        removeAccount(id)
            .then(() => {
                // Emit only after the delete has committed, so the funnel never
                // counts a removal that a storage failure rolled back.
                track('account_removed', {
                    account_id: id,
                    account_count_after: countAfter,
                    was_active: wasActive,
                    account_age_days: accountAgeDays
                })

                return refresh()
            })
            .catch((err) => setError(err.message))
    }

    const handleSetActive = (id) => {
        setError('')

        const previousActiveId = activeAccountId

        setActiveAccount(id)
            .then((activeId) => {
                track('account_activated', {
                    account_id: activeId,
                    account_count: accounts.length,
                    was_auto_selected: false,
                    previous_active_account_id: previousActiveId
                })

                return refresh()
            })
            .catch((err) => setError(err.message))
    }

    const handleTradeClick = (account) => {
        track('trade_link_clicked', {
            source: 'account_row',
            account_id: account.id,
            destination_url: buildTradeUrl(account.chainId),
            account_count: accounts.length
        })

        // This click can unload the document, so the sink is flushed rather than
        // left to a later tick that may never run.
        callAnalytics(flushAnalytics, undefined)
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
                    onChange={(e) => {
                        noteFormStarted()
                        setLabel(e.target.value)
                    }}
                    placeholder='Savings'
                />

                <label htmlFor='account-address'>Public wallet address</label>
                <input
                    id='account-address'
                    type='text'
                    value={address}
                    onChange={(e) => {
                        noteFormStarted()
                        setAddress(e.target.value)
                    }}
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
                                onClick={() => handleTradeClick(account)}
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
