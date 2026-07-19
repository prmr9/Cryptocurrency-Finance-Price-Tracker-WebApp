# Changelog

## Unreleased
- KAN-1: Add a Trade button linking to an open-source trading platform (DevAgent)
- KAN-2: Instrument the KAN-1 Trade link with a dependency-free, vendor-neutral
  analytics emitter seam. Ships four client-observable events; no live
  destination is configured, so no event leaves the browser until
  `REACT_APP_ANALYTICS_ENDPOINT` is set. See `docs/analytics/KAN-2-events.md`
  for the event table and the four platform-side events recorded as BLOCKED.
  (DevAgent)
