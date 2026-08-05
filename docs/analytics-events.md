# Analytics events (KAN-5)

Event contract for the wallet-account onboarding funnel instrumented in KAN-5.
The emitter is `src/services/analytics.js`. The two persistence-commit events,
`account_added` and `account_removed`, are emitted from
`src/services/accountStore.js` at the boundary where the write commits; every
other event is emitted from the view. The store imports only the tracker — a
strict one-way dependency, since analytics never imports the store — and never
persists a telemetry-only field onto an account record.

Identifiers are one-way hashed at the emit boundary, and raw wallet addresses are
never passed to the sink — call sites hand over an address *shape* enum instead.

## Sessions

A session is a 30-minute inactivity window. The first tracked event mints a
session id and every later event extends it; once more than 30 minutes of
inactivity pass between two events, the next event opens a new session and
increments the session counter. Session state lives in the analytics-owned
localStorage key rather than per-tab storage, so several open tabs share one
session and closing a tab does not fabricate a new one.

`SESSION_TIMEOUT_MS` in `src/services/analytics.js` is the single source of truth
for the 30-minute rule.

## Entry source

Every `accounts_view_opened` event carries `entry_source`, resolved to exactly
one of four mutually exclusive values:

- `in_app_nav` — the user moved to the accounts view from another route inside
  this SPA instance.
- `browser_history` — a Back/Forward navigation: either a POP after an in-app
  navigation, or a `back_forward` navigation-timing entry on a cold start.
- `reload` — the accounts view was reloaded in place.
- `direct_url` — a cold hit on the URL with no prior in-app navigation, and the
  fallback when navigation timing is unavailable.

The list above is also the resolution order: an earlier value wins, so a real
in-app navigation can never fall through to `direct_url`.

## Derived account-age metrics

`days_since_first_account` and `account_age_days` are null for accounts that already existed before this instrumentation shipped, because those accounts have no recorded first-seen timestamp — the value is reported as null, never as 0.

Accounts present the first time instrumentation runs are recorded as
pre-existing, so they are never later mistaken for accounts created under
observation. `sessions_since_first_account` follows the same rule: it stays null
until a first account is created under instrumentation.

## Events

Every event below is emitted through `src/services/analytics.js` and carries the
shared session envelope in addition to the properties listed for it.

### `accounts_view_opened`

| Property | Type | Notes |
| --- | --- | --- |
| `entry_source` | enum | One of the four values in [Entry source](#entry-source). |
| `existing_account_count` | number | Accounts already stored when the view opened. |
| `is_first_visit` | boolean | True only for the first opened view under instrumentation. |

### `add_account_submitted`

| Property | Type | Notes |
| --- | --- | --- |
| `label_provided` | boolean | Whether the optional label field was non-empty. |
| `address_format` | enum | Shape of the submitted address, never the address itself: `evm_hex_42`, `evm_hex_40_no_prefix`, `too_short`, `too_long`, `non_hex`, or `empty`. Supersedes the plan's original `address_length`, which is address-derived and, at a near-constant 42 for EVM, carries no signal; `track()` drops `address_length` at the emit boundary if a caller ever passes it. |
| `existing_account_count` | number | Accounts stored at submit time. |

### `add_account_validation_failed`

| Property | Type | Notes |
| --- | --- | --- |
| `error_code` | string | Stable machine-readable validation code. |
| `error_message` | string | Human-readable copy shown to the user. |
| `field` | string | Form field that failed (`address`, `label`). |
| `attempt_number` | number | 1-based submit attempt within this add flow. |

### `account_added`

| Property | Type | Notes |
| --- | --- | --- |
| `account_id` | string | One-way hash of the account identifier. |
| `account_count_after` | number | Accounts stored after the commit. |
| `is_first_account` | boolean | True when this is the user's first account. |
| `attempts_before_success` | number | Failed validation attempts preceding the success. |
| `time_to_add_ms` | number | Milliseconds from opening the add form to the commit. |

### `account_activated`

| Property | Type | Notes |
| --- | --- | --- |
| `account_id` | string | Hashed id of the newly active account. |
| `account_count` | number | Accounts stored at activation time. |
| `was_auto_selected` | boolean | True when the app selected the account, not the user. |
| `previous_active_account_id` | string \| null | Hashed id of the prior active account, null if none. |

### `trade_link_clicked`

| Property | Type | Notes |
| --- | --- | --- |
| `source` | string | UI surface the link was clicked from. |
| `account_id` | string | Hashed id of the account in context. |
| `destination_url` | string | Outbound trade destination. |
| `account_count` | number | Accounts stored at click time. |

### `accounts_returned`

| Property | Type | Notes |
| --- | --- | --- |
| `account_count` | number | Accounts stored on return. |
| `active_account_id` | string \| null | Hashed id of the active account, null if none. |
| `days_since_first_account` | number \| null | Null for pre-existing accounts — see above. |
| `sessions_since_first_account` | number \| null | Null until a first account is created under instrumentation. |

### `account_removed`

| Property | Type | Notes |
| --- | --- | --- |
| `account_id` | string | Hashed id of the removed account. |
| `account_count_after` | number | Accounts stored after the deletion commit. |
| `was_active` | boolean | True when the removed account was the active one. |
| `account_age_days` | number \| null | Null for pre-existing accounts — see above. |

## Prices-table market-cap funnel (KAN-49)

KAN-49 instruments the market-cap formatting behaviour KAN-48 introduced in the
home-route (`/`) prices table. The four events are emitted from the prices-table
**view** (`src/components/Coins.js`) — never from the pure presentational
`CoinItem` row — via a single `useEffect` gated to fire once on the FIRST
non-empty coins load, so the data-quality payload is computed over real rows
rather than the initial empty array. Emission reuses `src/services/analytics.js`;
`track()` auto-attaches the session envelope (`session_id` + `ts`) and never
throws. Every storage and `track()` call is wrapped in a single `try/catch` so
telemetry can never break render.

`user_id` and `timestamp` from the generic stubs are **omitted**: the home route
is anonymous (no authenticated user) and `track()` already attaches `session_id`
and `ts`. The funnel is **session/device-scoped, not per-user** — `kan_48_returned`
is a device-return heuristic (a `localStorage` flag set on the first visit),
disambiguated from an in-session remount (prices → coin detail → Back) by a
`sessionStorage` flag that suppresses a re-fire within the same session. All four
events carry `source: 'prices_table'`.

`missing_market_cap_count` counts rows where `!Number.isFinite(coin.market_cap)`
— the SAME predicate as KAN-48's `formatMarketCap` guard — so the count equals
the number of em-dashes rendered: `null`/`undefined`/`NaN` are missing while a
legitimate `0` (and any finite number) counts as present.

### `kan_48_viewed`

| Property | Type | Notes |
| --- | --- | --- |
| `source` | string | UI surface — always `prices_table`. |

_Engagement — the user sees the prices-table entry point. Emitted on first
non-empty load and on a device return; suppressed on an in-session remount._

### `kan_48_started`

| Property | Type | Notes |
| --- | --- | --- |
| `source` | string | UI surface — always `prices_table`. |

_Activation — first-visit only (localStorage `kan48_prices_seen` falsy)._

### `kan_48_completed`

| Property | Type | Notes |
| --- | --- | --- |
| `source` | string | UI surface — always `prices_table`. |
| `row_count` | number | Rows in the first non-empty coins load. |
| `missing_market_cap_count` | number | Rows where `!Number.isFinite(market_cap)` (`null`/`undefined`/`NaN`); a `0` counts as present. Equals the number of em-dashes rendered. |
| `outcome` | enum | `has_missing` when `missing_market_cap_count > 0`, else `all_present`. |
| `duration_ms` | number | Milliseconds from component mount to the emission. |

_Activation — first-visit only; the aha moment (the formatted market-cap column
is on screen). Sets `kan48_prices_seen` so a later session reads as a return._

### `kan_48_returned`

| Property | Type | Notes |
| --- | --- | --- |
| `source` | string | UI surface — always `prices_table`. |

_Retention — a genuine cross-session device return (`kan48_prices_seen` truthy).
Device/session-scoped, not a true per-user return._

## Loop coverage

The KAN-5 plan's eight events plus KAN-49's four map onto the four growth loops
as follows. KAN-49 adds **+2 activation** (`kan_48_started`, `kan_48_completed`)
and **+1 retention** (`kan_48_returned`); `kan_48_viewed` is an engagement event.

| Loop | Events | What it answers |
| --- | --- | --- |
| Activation | `accounts_view_opened`, `add_account_submitted`, `add_account_validation_failed`, `account_added`, `kan_48_started`, `kan_48_completed` | How many users who reach the accounts view finish adding a first account, and — for KAN-49 — how many who load the prices table reach the formatted market-cap column, with what data quality. |
| Engagement | `account_activated`, `add_account_submitted`, `kan_48_viewed` | Whether users work with more than one account and how often they switch the active one, plus who sees the prices-table entry point. |
| Retention | `accounts_returned`, `account_removed`, `kan_48_returned` | Whether users come back after their first account, when they churn accounts back out, and whether a device returns to the prices table across sessions. |
| Revenue | `trade_link_clicked` | Outbound trade intent — the only monetising action in this flow. |

Every approved event belongs to at least one loop: no event is collected without
a question it answers, and no loop is left without an event.
