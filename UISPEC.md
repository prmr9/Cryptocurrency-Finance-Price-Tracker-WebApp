<!--
  UISPEC.md — FROZEN Phase 0 baseline (KAN-71).
  READ-ONLY BY CONVENTION. Do not edit in a later phase.
  See "Integrity & change control" at the bottom before changing anything.
-->

# UISPEC.md — Phase 0 UI behaviour audit (KAN-71)

**Status: FROZEN Phase 0 baseline. Read-only by convention.**

This document is the single source of truth for the app's **current, observable
UI behaviour** as it exists at the KAN-71 baseline. It is a read-only audit: it
records what the shipped code does *today*, not what it should do, not what is
planned, and not history. Every later phase is measured against the entries
here — a later phase's behaviour claim is only accepted when it is traceable to
a specific ID in this document (see
[How to cite this document](#how-to-cite-this-document-traceability)).

It follows the house documentation style already set by
[DATABASE.md](DATABASE.md) and [OBSERVABILITY.md](OBSERVABILITY.md): a table of
contents, one section per topic, and link-out over duplication.

---

## Table of contents

- [How to cite this document (traceability)](#how-to-cite-this-document-traceability)
- [Global application shell](#global-application-shell) — `App.js`
- [Routes](#routes) — the four routes below are the complete route table
  - [Route `/` — market list (Coins)](#route----market-list-coins)
  - [Route `/coin/:coinId` — coin detail (Coin)](#route-coincoinid--coin-detail-coin)
  - [Route `/accounts` — watchlist (Accounts)](#route-accounts--watchlist-accounts)
  - [Route `/about` — about page (About)](#route-about--about-page-about)
- [Market row & formatters (CoinItem)](#market-row--formatters-coinitem)
- [Sparkline (SparkLine)](#sparkline-sparkline)
- [Navbar](#navbar)
- [Footer](#footer)
- [Analytics](#analytics)
- [Coverage checklist](#coverage-checklist)
- [Known aspirational-vs-live](#known-aspirational-vs-live)
- [Data contract](#data-contract) — per-screen API-call catalogue (C3)
- [State inventory](#state-inventory) — every store, slice & `useState` (C4)
- [Design debt count](#design-debt-count) — distinct in-use design-token values (C6)
- [Risk list](#risk-list) — the ten riskiest places to touch the UI (C7)
- [Integrity & change control (read-only)](#integrity--change-control-read-only)

---

## How to cite this document (traceability)

Every behaviour entry in this audit carries a **stable ID** of the form
`UISPEC-<AREA>-<NN>` (for example `UISPEC-COINITEM-01`). A later phase that
claims a behaviour must cite the ID of the entry it preserves, changes, or
removes.

Entries anchor on **stable code symbols** — a file path plus a function or
component name, e.g. `CoinItem.js#formatMarketCap` — **never on bare line
numbers**. Line numbers rot the moment a later phase edits a file; symbol names
survive edits, and where a symbol is renamed that rename is itself a reviewable,
traceable change. When an entry needs to point at code, it names the file and
the symbol.

`<AREA>` is one of: `GLOBAL`, `ROUTES`, `COINS`, `COINITEM`, `SPARKLINE`,
`ACCOUNTS`, `COIN`, `NAVBAR`, `FOOTER`, `ABOUT`.

---

## Global application shell

Source: `src/App.js#App`.

- **UISPEC-GLOBAL-01** — On mount, `App` fetches the top-50 market snapshot from
  CoinGecko with a single `axios.get`. The URL is
  `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true`
  (verified against the literal in `App.js#App`). The pages call CoinGecko
  **directly**; see [Known aspirational-vs-live](#known-aspirational-vs-live).
- **UISPEC-GLOBAL-02** — Two pieces of state live in `App`: `coins` (the fetched
  array, initial `[]`) and `lastUpdated` (a `Date`, initial `null`). On a
  successful fetch both are set; `lastUpdated` is set to `new Date()` at
  response time.
- **UISPEC-GLOBAL-03** — A fetch failure is swallowed to the console
  (`.catch` → `console.log(error)`); `coins` stays `[]` and `lastUpdated` stays
  `null`, so the list renders its empty branch and no "Updated" banner appears.
- **UISPEC-GLOBAL-04** — The shell renders `Navbar`, then the `Routes` table,
  then `Footer`, in that order. `coins` and `lastUpdated` are passed as props
  only to the `/` route element (`Coins`); the other routes fetch their own data
  or use none.
- **UISPEC-GLOBAL-05** — Routing is React Router v6 `Routes`/`Route`. The router
  itself (`BrowserRouter`) is mounted above `App` in `src/index.js#`.

---

## Routes

Source: `src/App.js#App` (the `<Routes>` block). The route table below is the
**complete** set of routes; there are exactly four reachable surfaces.

### Route `/` — market list (Coins)

- **UISPEC-ROUTES-01** — `/` renders `<Coins coins={coins} lastUpdated={lastUpdated} />`.
  Behaviour detailed under [Market list (Coins)](#route----market-list-coins-detail).

### Route `/coin/:coinId` — coin detail (Coin)

- **UISPEC-ROUTES-02** — `/coin` renders `Coin`, with a nested `:coinId` child
  that also renders `Coin`; the reachable detail URL is `/coin/:coinId`.
  Behaviour detailed under [Coin detail](#route-coincoinid--coin-detail-detail).

### Route `/accounts` — watchlist (Accounts)

- **UISPEC-ROUTES-03** — `/accounts` renders `<Accounts />` (labelled "Watchlist"
  in navigation). Behaviour detailed under
  [Accounts](#route-accounts--watchlist-detail).

### Route `/about` — about page (About)

- **UISPEC-ROUTES-04** — `/about` renders `<About />`. Behaviour detailed under
  [About](#route-about--about-page-detail).

---

<a id="route----market-list-coins-detail"></a>

### Market list (Coins) — behaviour

Source: `src/components/Coins.js#Coins`.

- **UISPEC-COINS-01** — Renders a hero: title "Track live crypto prices in real
  time" (with "crypto prices" in `.hero-accent`) and a subtitle describing the
  top cryptocurrencies "powered by CoinGecko".
- **UISPEC-COINS-02** — A search input (`.coin-search-input`, `aria-label`
  "Search coins by name or symbol", placeholder "Search by name or symbol (e.g.
  Bitcoin, ETH)") drives local `query` state.
- **UISPEC-COINS-03** — Filtering: the query is normalised via
  `query.trim().toLowerCase()`; a non-empty query keeps coins whose `name` **or**
  `symbol` (both lower-cased) `includes` the search; an empty query shows all
  `props.coins` unfiltered.
- **UISPEC-COINS-04** — "Updated" banner: rendered **only** when
  `props.lastUpdated` is truthy, showing `props.lastUpdated.toLocaleTimeString()`
  (verified: local-time string, no date). When `lastUpdated` is `null` no banner
  renders.
- **UISPEC-COINS-05** — Column heading row (`.heading`) has six cells: `#`,
  `Coin`, `Price`, `24h`, `Volume`, `Mkt Cap`. `Volume` and `Mkt Cap` carry
  `.hide-mobile`.
- **UISPEC-COINS-06** — Empty state: when `filteredCoins.length === 0`, renders
  `.coin-empty` with the copy `No coins in the top 50 match “<query.trim()>”. Try
  another name or symbol.` (verified against the literal, curly quotes around the
  trimmed query).
- **UISPEC-COINS-07** — Otherwise each coin renders as a
  `<Link to={`/coin/${coins.id}`}>` wrapping a `<CoinItem coins={coins} />`,
  keyed by `coins.id`.

---

<a id="route-coincoinid--coin-detail-detail"></a>

### Coin detail (Coin) — behaviour

Source: `src/routes/Coin.js#Coin`.

- **UISPEC-COIN-01** — On mount / when `url` changes, fetches
  `https://api.coingecko.com/api/v3/coins/${params.coinId}` via `axios.get`;
  `coin` state defaults to `{}`. A failure is swallowed to `console.log`.
- **UISPEC-COIN-02** — Header shows `coin.name` (twice — page title and heading),
  a rank pill "Rank # `coin.market_cap_rank`", the small image
  (`coin.image.small`, guarded), and `SYMBOL/USD` (upper-cased, guarded).
- **UISPEC-COIN-03** — Current price: `coin.market_data.current_price.usd`
  rendered via `toLocaleString()`, guarded on `coin.market_data?.current_price`.
- **UISPEC-COIN-04** — Percentage-change table with six columns `1h`, `24h`,
  `7d`, `14d`, `30d`, `1yr`, each cell `…toFixed(1)%`, drawn from
  `coin.market_data.price_change_percentage_*_in_currency.usd`. (Note the audit
  records actual behaviour: the `7d`/`14d`/`30d`/`1yr` cells are guarded on the
  **24h** field, so they render together with 24h.)
- **UISPEC-COIN-05** — Stats block: "24 Hour Low"/"24 Hour High"
  (`low_24h.usd`/`high_24h.usd`), "Market Cap" (`market_cap.usd`), and
  "Circulating Supply" (`circulating_supply`), each guarded and `toLocaleString`
  where numeric.
- **UISPEC-COIN-06** — About section: `coin.description.en` is rendered via
  `dangerouslySetInnerHTML` **after** `DOMPurify.sanitize(...)` (verified: the
  description HTML is sanitized before injection; empty string when no
  description).

---

<a id="route-accounts--watchlist-detail"></a>

### Accounts (Watchlist) — behaviour

Source: `src/components/Accounts.js#Accounts`, backed by
`src/services/accountStore.js` and `src/services/uniswap.js`.

- **UISPEC-ACCOUNTS-01** — Persistence: the account list (label, public wallet
  address, chain id) is stored in the browser via `accountStore` (localStorage).
  No private keys are collected; a standing notice (`.accounts-notice`) states
  only a label and public address are stored, in-browser.
- **UISPEC-ACCOUNTS-02** — Add form: `Label`, `Public wallet address`, and a
  `Network` `<select>` whose options come from `CHAIN_SLUGS`
  (`services/uniswap.js`). Submit is disabled while `submitting`.
- **UISPEC-ACCOUNTS-03** — Validation errors from the store surface in a single
  `.accounts-error` element with `role="alert"` (label required, invalid
  address, duplicate address, storage unavailable). The store owns the prose;
  the view maps it to a stable machine code for analytics.
- **UISPEC-ACCOUNTS-04** — Loading state: while the initial load is in flight, an
  `.accounts-empty` node reads "Loading accounts…".
- **UISPEC-ACCOUNTS-05** — Empty state: once loaded with zero accounts, an
  `.accounts-empty` node reads "No accounts yet. Add one above to get started."
- **UISPEC-ACCOUNTS-06** — Account rows list label, address, and resolved chain
  slug (`CHAIN_SLUGS[chainId]` or "unknown network"). The active account shows an
  "Active" badge; others show a "Set active" button. The first account added is
  auto-promoted to active by the store.
- **UISPEC-ACCOUNTS-07** — Each row has a "Trade" link to
  `buildTradeUrl(account.chainId)` and a "Remove" button. The Trade link opens a
  new tab (`target="_blank"`, `rel="noopener noreferrer"`) with an `sr-only`
  "(opens in new tab)" cue.
- **UISPEC-ACCOUNTS-08** — Every user action on this view (view opened, submit,
  add success/failure, activate, remove, trade click) emits an analytics event.
  The event contract is **not** duplicated here — see [Analytics](#analytics).

---

<a id="route-about--about-page-detail"></a>

### About — behaviour

Source: `src/routes/About.js#About`.

- **UISPEC-ABOUT-01** — Static page: a hero ("About CryptoTracker"), three cards
  ("Live market data", "Search the market", "Trade when you're ready"), and a
  "← Back to prices" `Link` to `/`.
- **UISPEC-ABOUT-02** — The "Trade when you're ready" card links out to
  `TRADE_URL` (Uniswap) with `target="_blank"` `rel="noopener noreferrer"`. No
  data fetch; no state.

---

## Market row & formatters (CoinItem)

Source: `src/components/CoinItem.js`.

- **UISPEC-COINITEM-01** — `CoinItem.js#formatMarketCap` — formats a market-cap
  number. Uses `Number.isFinite` as the guard: non-finite (`null`/`undefined`/
  `NaN`) → the em-dash `—` (`—`); a finite value (including `0`) →
  `$` + `value.toLocaleString('en-US')` (locale pinned to en-US for deterministic
  grouping).
- **UISPEC-COINITEM-02** — `CoinItem.js#formatChange` — maps the raw 24h change
  to `{ className, display, direction }`. Non-finite or exactly `0` →
  `change-neutral` / `"0.00%"` / `"no change"`; `> 0` → `change-positive` /
  `"+X.XX%"` / `"up"`; `< 0` → `change-negative` / `"X.XX%"` / `"down"`. The
  direction word is rendered `sr-only` so meaning survives colour-blindness.
- **UISPEC-COINITEM-03** — `CoinItem.js#formatRankMovement` (also a named export)
  — derives the rank-movement arrow from `market_cap_change_percentage_24h`
  (there is no previous-rank field in the payload). Strict `Number.isFinite`
  guard: `> 0` → `▲` / `rank-up` / "rank rising"; `< 0` → `▼` / `rank-down` /
  "rank falling"; `0` or non-finite → `–` / `rank-unchanged` / "rank unchanged".
  Rendered inside the rank cell as `role="img"` with the srLabel as `aria-label`.
- **UISPEC-COINITEM-04** — Row layout: rank (+ movement glyph), image + symbol
  labels, price (`current_price.toLocaleString()`), 24h change + sparkline,
  volume (`.hide-mobile`), market cap (`.hide-mobile`). The full name
  (`.coin-fullname`) is rendered **only** when it is non-empty and does not
  merely restate the upper-cased ticker (avoids "BTC BTC").

---

## Sparkline (SparkLine)

Source: `src/components/SparkLine.js`.

- **UISPEC-SPARKLINE-01** — `SparkLine.js#computeSparkline` — turns a price series
  into an SVG polyline `points` string, or `null` when undrawable. Requires an
  array with `≥ 2` finite points; a flat week (`max === min`) draws a horizontal
  mid-line; coordinates are inset by `PAD` and rounded to 2dp. Fixed geometry
  `WIDTH` 56 × `HEIGHT` 20, `PAD` 2 (all named exports).
- **UISPEC-SPARKLINE-02** — `SparkLine.js#formatTrend` — direction of the week
  from first vs last finite point → `{ className, direction, label }`: non-finite
  or zero diff → `trend-flat` / "7-day trend flat"; `> 0` → `trend-up` /
  "7-day trend up X.XX%"; `< 0` → `trend-down` / "7-day trend down X.XX%".
  Guards `first === 0` so the percentage is omitted rather than dividing by zero.
- **UISPEC-SPARKLINE-03** — Render: when `computeSparkline` returns `null`, an
  empty reserved-space placeholder `<span class="coin-sparkline
  coin-sparkline--empty" aria-hidden="true" />` holds the box open (no text, no
  crash). Otherwise an `<svg role="img">` labelled with `formatTrend().label`
  containing one `<polyline>` classed by trend.

---

## Navbar

Source: `src/components/Navbar.js#Navbar`.

- **UISPEC-NAVBAR-01** — Brand link (coins icon + "CryptoTracker") to `/`, and a
  primary nav (`aria-label="Primary"`) with `Prices` (`/`), `Watchlist`
  (`/accounts`), `About` (`/about`).
- **UISPEC-NAVBAR-02** — A "Trade" CTA links to `TRADE_URL`
  (`services/uniswap.js`) with `target="_blank"` `rel="noopener noreferrer"` and
  an `sr-only` "(opens in new tab)" cue. The click emits one analytics event
  (contract in [Analytics](#analytics)).

---

## Footer

Source: `src/components/Footer.js#Footer`.

- **UISPEC-FOOTER-01** — Wordmark "CryptoTracker", tagline "Live cryptocurrency
  prices, powered by CoinGecko", a footer nav (`aria-label="Footer"`) mirroring
  `Prices`/`Watchlist`/`About` plus a `Trade` new-tab link to `TRADE_URL`, and a
  legal line: "Market data is for informational purposes only and is not
  financial advice."

---

## Analytics

The account-onboarding funnel is instrumented; the emitter is
`src/services/analytics.js`, with two persistence-commit events emitted from
`src/services/accountStore.js`. The **event contract (event names, properties,
session model, redaction) is documented once** in
[docs/analytics-events.md](docs/analytics-events.md) and is intentionally **not
restated inline here** — this audit links out rather than duplicating the
catalog, so the two never drift.

- **UISPEC-ACCOUNTS-09** — Behaviour claim: analytics is emitted on every
  Accounts action and on the Navbar/Footer/Accounts "Trade" clicks; the exact
  event names and payloads are the ones enumerated in
  [docs/analytics-events.md](docs/analytics-events.md).

---

## Coverage checklist

This audit is exhaustive over the surfaces below. Each item is marked **captured**
(covered by an ID above); completeness is a checkable gate, not a silent gap.

### Routes (complete route table)

- [x] `/` — market list — **captured** (UISPEC-ROUTES-01, UISPEC-COINS-01…07)
- [x] `/coin/:coinId` — coin detail — **captured** (UISPEC-ROUTES-02, UISPEC-COIN-01…06)
- [x] `/accounts` — watchlist — **captured** (UISPEC-ROUTES-03, UISPEC-ACCOUNTS-01…09)
- [x] `/about` — about — **captured** (UISPEC-ROUTES-04, UISPEC-ABOUT-01…02)

### Named formatters (every exported/named formatter)

- [x] `formatMarketCap` (`CoinItem.js`) — **captured** (UISPEC-COINITEM-01)
- [x] `formatChange` (`CoinItem.js`) — **captured** (UISPEC-COINITEM-02)
- [x] `formatRankMovement` (`CoinItem.js`) — **captured** (UISPEC-COINITEM-03)
- [x] `computeSparkline` (`SparkLine.js`) — **captured** (UISPEC-SPARKLINE-01)
- [x] `formatTrend` (`SparkLine.js`) — **captured** (UISPEC-SPARKLINE-02)

### Empty / error / loading states (every one)

- [x] Coins empty (no coins match filter) — **captured** (UISPEC-COINS-06)
- [x] Coins "Updated" banner absent when `lastUpdated` is null — **captured** (UISPEC-COINS-04)
- [x] Global fetch error (silently swallowed, list stays empty) — **captured** (UISPEC-GLOBAL-03)
- [x] Coin detail pre-load / missing `market_data` (guarded `null` cells) — **captured** (UISPEC-COIN-02…06)
- [x] Coin detail fetch error (swallowed to console) — **captured** (UISPEC-COIN-01)
- [x] Accounts loading ("Loading accounts…") — **captured** (UISPEC-ACCOUNTS-04)
- [x] Accounts empty ("No accounts yet…") — **captured** (UISPEC-ACCOUNTS-05)
- [x] Accounts validation error (`role="alert"`) — **captured** (UISPEC-ACCOUNTS-03)
- [x] Sparkline empty placeholder (`< 2` finite points) — **captured** (UISPEC-SPARKLINE-03)

---

## Known aspirational-vs-live

The audit records **actual current behaviour**. `src/api/apiClient.js` and
`src/api/portfolioClient.js` (a backend API access layer) exist in the tree, but
the shipped UI pages do **not** use them today: `App.js` and `Coin.js` call the
CoinGecko API **directly** via `axios` (see UISPEC-GLOBAL-01, UISPEC-COIN-01).
That backend layer is therefore **aspirational, not live**, and is documented
here only to prevent a later phase mistaking its presence for current behaviour.

---

## Data contract

> **Phase-0 contracts defined in KAN-72 (all four).** This branch adds the four
> contracts the epic requires, each its own section below:
> **C3 — [Data contract](#data-contract)** (per-screen API-call catalogue),
> **C4 — [State inventory](#state-inventory)** (every store, slice & `useState`),
> **C6 — [Design debt count](#design-debt-count)** (distinct in-use design-token
> values), and **C7 — [Risk list](#risk-list)** (the ten riskiest places to
> touch the UI).

Per-screen catalogue of **every** API call the app makes today: HTTP method,
full path, request shape, response shape, the file it lives in, and — critically
— whether the call is made **inside a React component** (an in-component call)
rather than behind the dedicated client layer. There are exactly two live
network calls today; both are raw `axios.get` calls made **inside a component**,
bypassing `src/api/apiClient.js` + `src/api/portfolioClient.js`.

The screens are the four routes in `src/App.js#App`'s `<Routes>` block, in the
order they are declared there (`/`, `/accounts`, `/about`, `/coin/:coinId`; note
`/coin` is a parent route whose `:coinId` child renders the same `Coin` element,
so the reachable detail URL is `/coin/:coinId`).

### Data contract — screen `/` (Coins)

| Field | Value |
|-------|-------|
| **Method / path** | `GET https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true` |
| **Request shape** | Query params only (no body, no headers, no auth). Fixed literal string; nothing is user-supplied. |
| **Response shape** | JSON array `coins[]` (top 50). Each element carries `id`, `symbol`, `name`, `image`, `current_price`, `market_cap`, `market_cap_rank`, `total_volume`, `price_change_percentage_24h`, `market_cap_change_percentage_24h`, and `sparkline_in_7d.price[]`. Stored verbatim into `coins` state; consumed by `Coins` → `CoinItem`/`SparkLine`. |
| **Location** | `src/App.js#App` — inside the mount `useEffect` (`axios.get(url)`). |
| **In-component?** | **YES — FLAGGED IN-COMPONENT.** Raw `axios.get` in the `App` component body; does **not** go through `apiClient`/`portfolioClient`. See [UISPEC-GLOBAL-01](#global-application-shell) and [Known aspirational-vs-live](#known-aspirational-vs-live). |

### Data contract — screen `/accounts` (Accounts)

| Field | Value |
|-------|-------|
| **Method / path** | **No network API call.** |
| **Request / response** | n/a — persistence is browser `localStorage` under key `coinsearch.accounts.v1`, reached via `src/services/accountStore.js` (`listAccounts`, `getActiveAccountId`, `addAccount`, `removeAccount`, `setActiveAccount`). These return Promises but resolve synchronously off `localStorage`; **no `fetch`/`axios` is issued.** |
| **Location** | `src/components/Accounts.js#Accounts` → `src/services/accountStore.js`. |
| **In-component?** | n/a — no network call to flag. Analytics side effects (`src/services/analytics.js`) are an emitter, not a screen data fetch, and are contracted separately in [docs/analytics-events.md](docs/analytics-events.md). |

### Data contract — screen `/about` (About)

| Field | Value |
|-------|-------|
| **Method / path** | **No network API call.** |
| **Request / response** | n/a — `src/routes/About.js#About` is a static page (hero + three cards + a `Link` to `/` and an outbound `TRADE_URL` link). No data fetch, no state. |
| **Location** | `src/routes/About.js#About`. |
| **In-component?** | n/a — no network call to flag. |

### Data contract — screen `/coin/:coinId` (Coin)

| Field | Value |
|-------|-------|
| **Method / path** | `GET https://api.coingecko.com/api/v3/coins/${coinId}` (template literal; `coinId` from `useParams()`). |
| **Request shape** | Path param `coinId` only (no body, no headers, no auth). |
| **Response shape** | A single coin-detail object: `name`, `symbol`, `image.small`, `market_cap_rank`, `description.en`, and a nested `market_data` (`current_price.usd`, `price_change_percentage_{1h,24h,7d,14d,30d,1y}_in_currency.usd`, `low_24h.usd`, `high_24h.usd`, `market_cap.usd`, `circulating_supply`). Stored into `coin` state (default `{}`); every cell is null-guarded. |
| **Location** | `src/routes/Coin.js#Coin` — inside the `useEffect` keyed on `url` (`axios.get(url)`). |
| **In-component?** | **YES — FLAGGED IN-COMPONENT.** Raw `axios.get` in the `Coin` component body; does **not** go through `apiClient`/`portfolioClient`. See [UISPEC-COIN-01](#route-coincoinid--coin-detail-detail). |

### Present-but-unwired backend client layer (called by NO screen)

Recorded truthfully as **present but not called by any screen** — no route above
invokes it. Documented so a later phase does not mistake its presence for live
wiring.

| Function | Method / path | Request shape | Response shape | Location |
|----------|---------------|---------------|----------------|----------|
| `getPortfolios()` | `GET /portfolios` | none (session cookie via `credentials: 'include'`) | `{ portfolios }` → returns `data.portfolios` | `src/api/portfolioClient.js` → `apiClient.js#apiFetch` |
| `putPortfolio(name, holdings, version)` | `PUT /portfolios` | body `{ name, holdings, version }` | upsert result; `409` → `VersionConflictError` | `src/api/portfolioClient.js` |
| `importLocalData({ default, watchlist })` | `POST /me/import` | body `{ default, watchlist }` | `{ imported }` → returns `data.imported` | `src/api/portfolioClient.js` |
| `apiFetch(path, options)` | `${REACT_APP_API_BASE_URL}${path}` | JSON body when provided; `credentials: 'include'` | parsed JSON, or `ApiError`/`VersionConflictError` on non-2xx | `src/api/apiClient.js#apiFetch` |
| `connect()` (backend only) | RDS PostgreSQL via `pg` Pool | n/a — server-side DB, unreachable from a static SPA | a connected `pg` Pool | `src/services/db.js` → `server/src/db/pool.js#getPool` |

---

## State inventory

Every piece of app state, with its **readers** and **writers**. There is **no
global store and no store slice** — the app ships **no** Redux/Zustand/Context
store, so "stores" here are the two stateful **service modules**
(`accountStore.js`, `db.js`). All React state is component-local `useState`
(plus two `useRef` mutable cells in `Accounts.js`).

### Stateful service modules ("stores")

| Store (module) | Stateful surface | Readers | Writers |
|----------------|------------------|---------|---------|
| **`src/services/accountStore.js`** | The persisted account list in `localStorage` under key `coinsearch.accounts.v1` (`{ version:1, accounts[], activeAccountId }`), plus a module-level `let idCounter = 0` used by `nextId()`. | `Accounts.js` via `listAccounts()` / `getActiveAccountId()`; validation-aware reads through `readState()`. Also read in `src/components/__tests__/accounts-onboarding.test.js`. | `Accounts.js` via `addAccount()` / `removeAccount()` / `setActiveAccount()`, each committing through `writeState()` → `localStorage`; `idCounter` incremented by `nextId()`. |
| **`src/services/db.js`** | **Holds NO module-level state itself** — it is a thin wrapper exporting `connect()`, which delegates to `getPool()`. Its actual stateful surface is the **memoized `pg` Pool module singleton** `let poolPromise = null` in **`server/src/db/pool.js#getPool`** (memoizes the in-flight `createPool()` Promise; resets to `null` on rejection so a failed first fetch is retryable). | **The backend / in-VPC API only** — `getPool()` is invoked server-side. **No React component reads it** (a static SPA cannot open a DB connection). | **The backend** — `getPool()` sets `poolPromise` on first call; the `.catch` resets it to `null`. **Not written by any component.** |

### Component `useState` (and `useRef`)

| State | Component | Initial | Readers | Writers |
|-------|-----------|---------|---------|---------|
| `coins` | `src/App.js#App` | `[]` | Passed as prop to `<Coins>` on `/` (the only consumer). | `setCoins(response.data)` in the mount `useEffect`. |
| `lastUpdated` | `src/App.js#App` | `null` | Passed as prop to `<Coins>`; gates the "Updated" banner. | `setLastUpdated(new Date())` on fetch success. |
| `query` | `src/components/Coins.js#Coins` | `''` | Filter predicate (`query.trim().toLowerCase()`) and the empty-state copy. | `setQuery(e.target.value)` on the search input's `onChange`. |
| `coin` | `src/routes/Coin.js#Coin` | `{}` | Every render cell (name, rank, price, change table, stats, description). | `setCoin(res.data)` in the `useEffect` keyed on `url`. |
| `accounts` | `src/components/Accounts.js#Accounts` | `[]` | Row list render, counts in analytics payloads, active-badge logic. | `setAccounts(rows)` in mount load, `refresh()`, and the error path. |
| `activeAccountId` | `src/components/Accounts.js#Accounts` | `null` | Active-badge vs "Set active" decision; `previousActiveId` in handlers. | `setActiveAccountIdState(...)` in load / `refresh()`. |
| `label` | `src/components/Accounts.js#Accounts` | `''` | Add-form input value; `label.trim()` in submit + analytics. | `setLabel(e.target.value)`; cleared to `''` on success. |
| `address` | `src/components/Accounts.js#Accounts` | `''` | Add-form input value; `classifyAddressShape(address)`. | `setAddress(e.target.value)`; cleared to `''` on success. |
| `chainId` | `src/components/Accounts.js#Accounts` | `1` | `<select>` value; passed to `addAccount()`. | `setChainId(Number(e.target.value))` on select change. |
| `error` | `src/components/Accounts.js#Accounts` | `''` | The `.accounts-error` `role="alert"` node. | `setError(...)` in handlers; cleared at the start of each action. |
| `loading` | `src/components/Accounts.js#Accounts` | `true` | Gates the "Loading accounts…" node. | `setLoading(false)` after the initial load settles. |
| `submitting` | `src/components/Accounts.js#Accounts` | `false` | Disables the submit button; re-entrancy guard in `handleSubmit`. | `setSubmitting(true/false)` around the add flow. |
| `attemptsRef` (`useRef`) | `src/components/Accounts.js#Accounts` | `0` | `attempts_before_success` in the add-success analytics event (see [docs/analytics-events.md](docs/analytics-events.md)). | `attemptsRef.current += 1` per submit; reset to `0` on success. |
| `firstAttemptAtRef` (`useRef`) | `src/components/Accounts.js#Accounts` | `null` | `time_to_add_ms` in the add-success analytics event (see [docs/analytics-events.md](docs/analytics-events.md)). | Set to `Date.now()` on first attempt; reset to `null` on success. |

---

## Design debt count

Count of **distinct in-use values** for each of the six token categories. The
point of this section is design-token debt: how many one-off literal values are
in play where a small, shared scale should be.

### Methodology (stated, reproducible)

- **Source scope.** The complete set of stylesheets under `src/**` — exactly
  seven files: `src/index.css`, `src/components/Coins.css`,
  `src/components/Accounts.css`, `src/components/Navbar.css`,
  `src/components/Footer.css`, `src/routes/About.css`, `src/routes/Coin.css`
  (`glob **/*.css` returns precisely these). Components carry **no** inline
  `style={{…}}` objects, so CSS is the whole styling surface.
- **Distinct-value rule.** A value counts once per category. Values are
  normalized before de-duplication: lowercased, a leading zero added
  (`.5rem` → `0.5rem`), surrounding whitespace trimmed. Shorthands are
  decomposed into their component values (`margin: 1rem 0 0.5rem` contributes
  `1rem`, `0`, `0.5rem`). A `var(--token)` **reference** is **not** a separate
  value — it resolves to the underlying token, counted once where the token is
  declared. Values are counted **as written**, including malformed ones (they
  are real in-use debt, footnoted below).
- **Per-category property scope.** *Spacing* = `margin`/`padding` (+ longhands),
  `gap`, `grid-gap`. *Font size* = `font-size`. *Font weight* = `font-weight`.
  *Colour* = solid colour values in colour-bearing properties (`color`,
  `background`/`background-color`, `border*` colour, `stroke`), including the
  `:root` `--color-*` custom properties; a colour that appears **only** inside a
  `box-shadow` is attributed to *Shadow*, and gradient stop colours are
  attributed to their gradient token (not double-counted). *Radius* =
  `border-radius`. *Shadow* = `box-shadow`.

### Counts

| Category | Distinct in-use values | Count |
|----------|------------------------|------:|
| **Spacing** | `0`, `-1px`, `-4rem`, `0.2rem`, `0.25rem`, `0.35em`, `0.35rem`, `0.4rem`, `0.5`¹, `0.5rem`, `0.55rem`, `0.6rem`, `0.7rem`, `0.75rem`, `0.85rem`, `0.9rem`, `1rem`, `1.25rem`, `1.3rem`, `1.5rem`, `2rem`, `3rem`, `4rem`, `8px`, `3px` | **25** |
| **Font size** | `clamp(2rem,5vw,3.25rem)`, `clamp(1.8rem,4.5vw,2.75rem)`, `0.75em`, `0.75rem`, `0.8rem`, `0.85rem`, `0.9rem`, `1rem`, `1.05rem`, `1.1rem`, `1.15rem`, `1.25rem`, `1.6rem` | **13** |
| **Font weight** | `500`, `600`, `800` | **3** |
| **Colour** | 10 tokenized (`:root --color-*`): `#0d0d0f`, `#16161a`, `#1f1f26`, `#f5f5f7`, `#9b9ba7`, `#26262e`, `#ff37c7`, `#8a4bff`, `#3ddc84`, `#ff5b5b`; + 12 raw literals: `#f4f4f4`, `#18191b`, `#6900ff`, `#3a3b3d`, `#ff6b6b`, `#a1a1a1`, `transparent`, `#ffffff`, `rgba(22,22,26,0.75)`, `#333`, `#808080`, `#d3d3d3` | **22**² |
| **Radius** | `9999px` (`--radius-pill`), `20px` (`--radius-card`), `8px` (raw literal) | **3** |
| **Shadow** | `0 4px 20px rgba(255,55,199,0.25)`, `0px 0px 8px #6900ff` | **2** |

¹ `.rank { margin: .5 0 }` in `src/routes/Coin.css` — a **malformed unitless**
spacing value (missing a unit); counted as written because it is real in-use
debt.
² Plus one gradient token, `--gradient-accent`
(`linear-gradient(90deg,#ff37c7,#8a4bff)`), whose stops reuse the accent tokens
and so add no new solid colour. **Debt signal:** only 10 colours are tokenized
while 12 raw literals are hardcoded across components — including near-duplicate
off-whites (`#f5f5f7` token vs `#f4f4f4` literal) and an accent purple
(`#6900ff`) that exists nowhere in `:root`. All four `box-shadow`/`radius`/
literal-colour debts sit outside the token system, so a token change never
reaches them.

---

## Risk list

The **ten** places where touching the UI is most likely to break behaviour, each
with the reason it is risky. This is the risk-first spine of the epic: a later
phase should treat these as the load-bearing spots to test around.

1. **`src/App.js#App` in-component CoinGecko markets fetch.** The raw
   `axios.get` in the component body is the **sole** data source for the entire
   `/` route; `coins`/`lastUpdated` are passed only to `Coins`. Moving it,
   changing the URL params (`per_page`, `sparkline`), or swapping it for the
   client layer changes every row and the sparklines at once.
2. **`src/routes/Coin.js#Coin` percentage-change table guards.** The `7d`,
   `14d`, `30d`, and `1yr` cells are all guarded on the **24h** field, not their
   own. "Fixing" a guard changes which cells render and can throw on
   `undefined.usd` for coins missing a horizon — a subtle, data-dependent crash.
3. **`src/routes/Coin.js#Coin` `dangerouslySetInnerHTML` + `DOMPurify.sanitize`.**
   The coin description is injected as HTML after sanitize. Editing or dropping
   the `DOMPurify.sanitize(...)` wrapper reopens an XSS hole — a security
   regression, not just a display bug.
4. **`src/services/accountStore.js` `localStorage` schema.** The shape is pinned
   to key `coinsearch.accounts.v1`, `version: 1`, and `isValidRow`/`ADDRESS_RE`.
   `readState()` silently **degrades to the empty state** on any mismatch, so
   changing the key, the version, or a field name **drops every saved account**
   with no error surfaced.
5. **`src/components/Accounts.js#Accounts` analytics emissions coupled to control
   flow.** `track(...)` calls are interleaved with state writes and ordered
   deliberately (the submit-intent event fires *before* validation to keep the
   funnel denominator honest). Reordering handlers or state updates changes the
   event stream contracted in [docs/analytics-events.md](docs/analytics-events.md).
6. **`src/components/Accounts.js#Accounts` `classifyStoreError` regexes.** The
   view maps the store's **user-facing prose** to stable machine codes via
   regex (`/label is required/i`, etc.). Editing an error string in
   `accountStore.js` silently reclassifies it to `unknown` and breaks the
   analytics `error_code`.
7. **`src/services/db.js` → `server/src/db/pool.js#getPool` memoized pool
   singleton.** The `pg` Pool is memoized in `poolPromise` (in-flight Promise,
   reset-on-reject) and fetches credentials at runtime from Secrets Manager with
   **no fallback**. Wiring the SPA to it or altering the lifecycle risks
   credential-fetch and connection regressions — and a static SPA must never
   import it at all.
8. **The present-but-unwired `src/api/apiClient.js` / `portfolioClient.js`
   layer.** A refactor that "activates" it by replacing the two in-component
   `axios` calls changes the whole data path and auth model at once (cookie
   `credentials: 'include'`, `ApiError`/`VersionConflictError` types, a
   build-time base URL) — a large blast radius disguised as a swap.
9. **`src/index.css` `:root` design tokens.** Most components consume
   `--color-*`, `--radius-*`, and `--gradient-accent` via `var()`. Renaming or
   removing a token silently breaks styling across **every** screen, while the
   12 raw-literal colours (e.g. `#6900ff`) won't move with the tokens — so a
   partial retheme drifts.
10. **`src/App.js#App` `<Routes>` nesting + `Coins.js` detail `Link`.** `/coin`
    is a **parent** route whose `:coinId` child renders the same `Coin` element,
    and `Coins.js` links via `` `<Link to={`/coin/${coins.id}`}>` `` (the
    `element` prop on that `Link` is inert). The reachable detail URL depends on
    this exact nesting; flattening or renaming the route breaks navigation from
    the market list.

---

## Integrity & change control (read-only)

- This file is a **frozen Phase 0 baseline** captured at the KAN-71 checkpoint.
  It is **read-only by convention**: it is not edited to reflect later-phase
  changes. When a later phase changes behaviour, that phase documents the change
  in its own artifact and cites the UISPEC IDs it supersedes — the baseline
  recorded here stays intact so "what changed" is always measurable against it.
- **Ownership backstop:** `CODEOWNERS` carries an entry for `/UISPEC.md` (see the
  repo-root `CODEOWNERS`), so any modification to this file requires the code
  owner's review. This is the immutability guard that survives git — unlike a
  filesystem read-only bit, which git does not track.
- **CI enforcement is currently UNENFORCED.** There is no CI job that hard-blocks
  edits to this file today. Automated, CI-level immutability enforcement is
  **deferred to a later phase**; until then, immutability rests on this
  convention plus the CODEOWNERS review requirement.
