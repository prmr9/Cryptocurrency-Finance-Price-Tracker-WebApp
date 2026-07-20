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

## Loop coverage

The approved plan's eight events map onto the four growth loops as follows.

| Loop | Events | What it answers |
| --- | --- | --- |
| Activation | `accounts_view_opened`, `add_account_submitted`, `add_account_validation_failed`, `account_added` | How many users who reach the accounts view finish adding a first account, and where the funnel leaks. |
| Engagement | `account_activated`, `add_account_submitted` | Whether users work with more than one account and how often they switch the active one. |
| Retention | `accounts_returned`, `account_removed` | Whether users come back after their first account, and when they churn accounts back out. |
| Revenue | `trade_link_clicked` | Outbound trade intent — the only monetising action in this flow. |

Every approved event belongs to at least one loop: no event is collected without
a question it answers, and no loop is left without an event.

## KAN-6 funnel side-tables (vendor-neutral)

KAN-6 adds a client-only, vendor-neutral layer for the six planned
activation/retention/engagement funnel events, alongside the KAN-5 emitter in the
same `src/services/analytics.js`. It owns two new versioned storage keys and never
touches KAN-4's account key or the KAN-5 `cfpt.analytics.v1` key:

| Key | Storage | Holds |
| --- | --- | --- |
| `coinsearch.analytics.v1` (`LOCAL_STORAGE_KEY`) | localStorage | anonymous `anon_<id>` client id, lifetime `firstExposureConsumed` flag, `firstValueReachedAt`, and the pruned `successDays` retention array |
| `coinsearch.analytics.session.v1` (`SESSION_STORAGE_KEY`) | sessionStorage | the `sess_<id>` session id plus per-session dedup flags, so "once per session" survives a full page reload but resets on a genuinely new session |

Privacy sanitizers keep raw values off the sink: `classifyReferrer(url, origin)`
reduces a referrer to `same_origin | external | direct` (never a path or query),
and `classifyFailure(err)` reduces an `Error` to
`missing_field | invalid_address | duplicate_account | unknown` (never the raw
message). Funnel gates — `recordExposure`, `recordFlowStartedOnce`,
`recordSuccess` — return the per-event dedup and retention facts. Every export is
guaranteed never to throw, even when storage is disabled or over quota.

| Planned event | Gate / source | Loop |
| --- | --- | --- |
| `feature_entry_point_viewed` | `recordExposure(surface)` → `is_first_exposure`, `shouldFire` | activation |
| `feature_flow_started` | `recordFlowStartedOnce()` → `shouldFire` | activation |
| `feature_action_submitted` | view seam (`entry_method` via `resolveEntryMethod`) | activation |
| `feature_first_value_reached` | `recordSuccess()` → `is_first_success` | activation |
| `feature_reused` | `recordSuccess()` → `days_since_first_value`, `usage_count_7d` | retention |
| `feature_action_failed` | `classifyFailure(err)` → `failure_reason` | engagement |
