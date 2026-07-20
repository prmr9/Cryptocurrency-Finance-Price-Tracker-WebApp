# Changelog

## Unreleased
- KAN-6: [Metrics] Instrument the change from KAN-5/KAN-4: extend the vendor-neutral analytics service with a client-only funnel layer for the six planned activation/retention events — an anonymous localStorage client id (`coinsearch.analytics.v1`), a sessionStorage-pinned session id and per-session dedup flags (`coinsearch.analytics.session.v1`), race-safe read-before-write funnel/retention state with 7-local-day pruning, and enum-only `classifyReferrer`/`classifyFailure` sanitizers so no raw URL, address, or error message reaches the sink. All exports are guaranteed never to throw. (DevAgent)
- KAN-5: [Metrics] Instrument the change from KAN-4: add a vendor-neutral analytics service and wire the eight wallet-account onboarding events into the Accounts view and Navbar. Account identifiers are one-way hashed at the emit boundary and no wallet address ever reaches the sink. (DevAgent)
- KAN-4: [Enhance] Cryptocurrency-Finance-Price-Tracker-WebApp: Add wallet-account onboarding, and make the Trade button account-aware. CONTEXT / CONSTRAINT (impor (DevAgent)
- KAN-1: Add a Trade button linking to an open-source trading platform (DevAgent)
