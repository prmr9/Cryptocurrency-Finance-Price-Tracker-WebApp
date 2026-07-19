# KAN-2 — Instrumentation for the KAN-1 Trade link

Human-approved analytics plan for the outbound Trade anchor shipped in KAN-1.
Vendor: **neutral**. No vendor SDK, no new npm dependency, no backend.

## DELIVERY STATUS — READ THIS FIRST

**KAN-2 ships an emitter seam with no live analytics destination configured.**

`src/analytics.js` composes and hands off event payloads, but the destination is
read from the `REACT_APP_ANALYTICS_ENDPOINT` environment variable, and this
change does not set that variable anywhere — not in the repo, not in the build,
not in CI. **With `REACT_APP_ANALYTICS_ENDPOINT` unset, no event reaches any
vendor.** Every payload is parked on `window.__ANALYTICS_EVENTS__` in the
browser and goes no further; `navigator.sendBeacon` is never called.

Concretely, that means:

- No analytics data is being collected today by this change.
- Nothing here should be read as shipped, flowing instrumentation. Dashboards
  built on these event names will be empty until an endpoint is configured.
- Turning the seam on is a separate, deliberate act: set
  `REACT_APP_ANALYTICS_ENDPOINT` at build time to a collector you control. That
  decision — and the privacy review that goes with it — is explicitly out of
  scope for KAN-2.

No destination URL literal appears anywhere in `src/analytics.js`.

## Identity and privacy posture

This app has no accounts, no login, and no auth surface of any kind. The
approved plan listed an account identifier and a signed-in-state flag on several
events; **both are omitted entirely** because there is nothing in this repo that
could populate them, and inventing them would mean building an identity surface
this ticket explicitly forbids.

What is collected instead:

| field | storage | lifetime |
| --- | --- | --- |
| `anon_id` | `localStorage['kan2.anon_id']` | until the user clears site data |
| `session_id` | `sessionStorage['kan2.session_id']` | until the tab closes |

Both are random, client-generated, and carry no personal data. No credentials,
cookies, form values, or third-party identifiers are read or transmitted.

## Events instrumented in this change

All four are emitted from `src/components/Navbar.js` via delegated listeners on
the navbar container — never an `onClick` prop on the anchor, per the ticket.

Every payload also carries the base properties `anon_id`, `session_id`,
`page_path`, `app_version`, plus an `event` name and an ISO `ts`.

| event | kind | when | extra properties |
| --- | --- | --- | --- |
| `navbar_trade_link_viewed` | activation | the Trade anchor first intersects the viewport in a session (once per session, `sessionStorage`-guarded) | `viewport_width` |
| `navbar_trade_link_clicked` | activation | mouse click, middle-click, or keyboard Enter on the anchor | `trade_url`, `link_target`, `activation_method`, `seconds_since_page_load` |
| `trade_link_repeat_used` | retention | a click on a later day than the first-ever click (at most once per day) | `days_since_first_trade_click`, `click_count_lifetime`, `distinct_days_used` |
| `trade_link_returned_to_app` | activation | this tab regains visibility after a foreground-opening Trade click, within 900s | `seconds_away` |

`activation_method` is one of `mouse_click`, `keyboard`, or `middle_click`.
`click` and `auxclick` never both fire for one activation, so each activation
emits exactly one click event.

## Events NOT instrumented — BLOCKED

Four events in the approved plan fire on the trading platform
(`app.uniswap.org`), a third party this repository does not own, does not
deploy, and cannot add code to. They are recorded here as blocked rather than
faked with a client-side approximation that would silently misreport.

| event | why it is blocked |
| --- | --- |
| `trade_platform_landed` | requires code on the destination page. Additionally, referrer-based attribution is impossible by construction: KAN-1 ships `rel='noopener noreferrer'`, which strips the referrer, and `TRADE_URL` is deliberately left byte-identical with no UTM parameters so the four existing KAN-1 tests keep passing unmodified. |
| `trade_account_ready` | platform-side account state. Not observable from this app. |
| `first_trade_completed` | platform-side trade execution. Not observable from this app. |
| `trade_executed` | platform-side trade settlement, including fee amounts. Not observable from this app. |

Unblocking any of these requires a data-sharing arrangement with the platform
and a change to the link's attribution parameters — both out of scope for KAN-2,
and the second would break KAN-1's acceptance tests.

## Swapping in a real destination

`src/analytics.js` exposes `setSink(fn)`. A future ticket can route payloads to
a vendor SDK by calling `setSink` once at app start, without touching the four
call sites in `Navbar.js`.
