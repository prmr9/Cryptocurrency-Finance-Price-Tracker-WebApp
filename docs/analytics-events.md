# Analytics events (KAN-5)

Event contract for the wallet-account onboarding funnel instrumented in KAN-5.
The emitter is `src/services/analytics.js`. `src/services/accountStore.js` is
deliberately untouched by this change: no telemetry-only field is ever persisted
onto an account record, and the store never imports the tracker.

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
