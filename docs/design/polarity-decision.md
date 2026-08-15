# Polarity decision (dark-first)

**Contract:** C16 — polarity-decision (dark-first)
**Status:** Settled. This decision is closed before Phase 2 (component adoption) begins.
**Ticket:** KAN-73

## Decision

The redesigned crypto/finance price tracker adopts an explicit **dark-vs-light
polarity** and defaults to **dark-first**.

- Polarity: **dark-first** (the base surface is dark; a light theme, if ever
  introduced, is a downstream inversion of this ramp, not the default).
- There is no automatic light mode in this phase. The single neutral ramp in
  `src/design/tokens.js` is authored dark-first from the darkest background up to
  the lightest text.

## Rationale

The live application is already a dark theme. `src/index.css` `:root` defines the
canonical values this decision codifies:

- background `--color-bg: #0d0d0f` (a near-black neutral, **not** pure `#000`),
- text `--color-text: #f5f5f7` (a near-white neutral, **not** pure `#fff`),
- surfaces `#16161a` / `#1f1f26`, border `#26262e`, muted text `#9b9ba7`.

Keeping the system dark-first means the token module mirrors reality instead of
proposing a new polarity that the shipped CSS does not honor. It also preserves
the accessible dark-surface treatment of the 24h change colors
(`--color-positive: #3ddc84`, `--color-negative: #ff5b5b`), which were chosen for
contrast on `#0d0d0f` rather than pure primaries.

## Machine-readable mirror

The authoritative machine-inspectable form of this decision is the `polarity`
field on the default export of `src/design/tokens.js`:

```js
polarity: 'dark-first'
```

The literal phrase **dark-first** appears both here and in that field so a
grep-based gate check is deterministic across the doc and the code.
