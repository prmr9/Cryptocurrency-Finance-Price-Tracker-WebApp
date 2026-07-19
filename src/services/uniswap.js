// Outbound-link contract for Uniswap.
//
// Uniswap (app.uniswap.org) is a non-custodial DEX: there is no account, no
// login and no session we can drive. All we can do is deep-link the user to
// the Explore page, where they connect their own wallet themselves.
//
// IMPORTANT: app.uniswap.org accepts NO wallet-address parameter. A user's
// address is never interpolated into an outbound URL from this module — the
// only query parameter we construct is `chain`, and its value always comes
// from the CHAIN_SLUGS lookup below, never from raw user input.

export const TRADE_URL = 'https://app.uniswap.org/explore'

export const CHAIN_SLUGS = {
    1: 'mainnet',
    10: 'optimism',
    56: 'bnb',
    137: 'polygon',
    8453: 'base',
    42161: 'arbitrum'
}

// Returns TRADE_URL with a ?chain=<slug> suffix when chainId maps to a known
// chain. For undefined, null, non-numeric or unmapped ids it returns the bare
// TRADE_URL — it never emits '?chain=undefined' or an empty chain param.
export function buildTradeUrl(chainId) {
    const slug = CHAIN_SLUGS[chainId]

    if (typeof slug !== 'string' || slug.length === 0) {
        return TRADE_URL
    }

    return `${TRADE_URL}?chain=${slug}`
}
