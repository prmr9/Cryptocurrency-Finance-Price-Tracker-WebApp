# KAN-74 — decomposition-validator dry-run report

**Ticket:** KAN-74 — Resolve decomposition gaps for EPIC
**Date:** 2026-08-15
**Subject:** the re-filed specs in
[`kan74-refiled-decomposition.json`](kan74-refiled-decomposition.json)
(T2, T5, T6, T7, T8)

## 1. What was rejected, and why it was a false positive

The original EPIC decomposition was **REJECTED** on a single edge:

```
Decomposition validation — EPIC: REJECTED
Rejections (must be fixed before any story starts):
  no story in this decomposition produces /partial/missing, referenced by T2's AC:
  "... Then it contains one row per screen and one column for each of
  {loading, error, empty, success, offline, permission-denied} with every cell
  marked exactly one of handled/partial/missing"
```

Root cause (confirmed by reading the repo and the AC text): the validator parsed
the enum `handled/partial/missing` — the set of allowed **cell values** — as an
artifact **path** `/partial/missing` and then looked for a producer story. There
is no such artifact; the slash-delimited enum was never a path. The ladder could
not repair automatically (L2 skipped — no online LLM for constrained
regeneration; L3 skipped — no redecompose callback wired), so L4 dropped T2 plus
its transitive dependents T5, T6, T7, T8.

## 2. The fix applied to the specs

1. **De-pathify T2 AC#1.** The enum `handled/partial/missing` is rewritten to
   `exactly one of: handled, partial, missing, or n/a`. This removes the slash
   form the validator mis-read as a path **and** adds an `n/a` token so
   non-applicable cells (e.g. `permission-denied` on a screen with no auth gate)
   are not overloaded onto `missing`.
2. **Router-derived rows, not a fixed count.** T2 AC#1 now says
   *"one row per screen enumerated from the App.js router source … the row count
   is derived from the App.js `<Route>` elements and is never a fixed literal"*,
   plus a point-in-time snapshot clause naming the snapshot date (2026-08-15) and
   a re-audit trigger when `App.js` or any file under `routes/` changes.
3. **Re-home the NEW anchors.** Every anchor that does **not** already exist in
   the frozen `UISPEC.md` is re-keyed from `UISPEC.md#<frag>` to
   `PHASE1-IA.md#<frag>`, so downstream build stories never mutate the
   CODEOWNERS-guarded, test-guarded `UISPEC.md`.

## 3. Anchor re-key ledger

Verified against the repo: neither new anchor exists in `UISPEC.md` today
(`grep` for `state-coverage-matrix` / `route-map` over the tree returns nothing
outside these KAN-74 artifacts), so both are genuinely new Phase-1 anchors.

| Anchor | Produced by | Original key | Re-filed key | Rationale |
|--------|-------------|--------------|--------------|-----------|
| `#state-coverage-matrix` | T2 | `UISPEC.md#state-coverage-matrix` | **`PHASE1-IA.md#state-coverage-matrix`** | New Phase-1 audit artifact; must not be added to the frozen doc. |
| `#route-map` | T5 | `UISPEC.md#route-map` | **`PHASE1-IA.md#route-map`** | New Phase-1 audit artifact; same reason. |
| `#data-contract` | (pre-existing reference) | `UISPEC.md#data-contract` | *unchanged — `UISPEC.md#data-contract`* | Referenced read-only by the original specs; not one of the rejected/new anchors, so left verbatim per the minimal-change rule. |

`PHASE1-IA.md` is **not created by KAN-74** — it is the companion doc that T2's
own build work will author. This ticket only re-keys the references so the target
home is correct once that build runs.

## 4. Dry-run result on the amended specs

The DevAgent decomposition-validator was re-run (dry-run) against the amended
`kan74-refiled-decomposition.json`. The prior `/partial/missing` rejection is
gone and no new rejection replaces it:

```
Decomposition validation — EPIC: ACCEPTED
Rejections: none
  (the prior "no story ... produces /partial/missing" rejection is resolved:
   T2 AC#1 no longer contains a slash-enum parseable as an artifact path)
Auto-fixed dependency edges (consumer → producer): none
Advisories: none
Dependency graph (preserved intact):
  T2 ← T1
  T5 ← T1, T2, T3, T4
  T6 ← T2, T3, T4
  T7 ← T2, T4, T5, T6
  T8 ← T7
Anchor production: #state-coverage-matrix ⇐ T2 (sole producer),
                   #route-map ⇐ T5 (sole producer);
                   neither consumed by its own producer.
```

## 5. In-repo backstop (executable)

The dry-run above is backed by an executable guard that runs in CI on every
change, so the mis-parse cannot silently regress:
[`src/__tests__/kan74-decomposition.test.js`](../../src/__tests__/kan74-decomposition.test.js).
It loads the decomposition JSON and `src/App.js` and asserts: (a) no
path-parseable enum in T2 AC#1; (b) an acyclic graph with every `depends_on`
target resolvable to T1–T8 and the exact edge set above; (c) each tracked anchor
has exactly one producer and is never consumed by that producer; and (d) the new
anchors are keyed to `PHASE1-IA.md` and the matrix row count is derived from the
parsed `App.js <Route>` elements rather than a hardcoded literal.

## 6. Out of scope (recorded, not delivered here)

Building `PHASE1-IA.md`'s actual content — the matrix cells, the route-map rows,
and the `ia-proposal-*` documents — is **T2's own build work** once re-filed. An
executable matrix-value-vs-runtime assertion is likewise recorded as T2's
definition-of-done, since KAN-74 changes no application code (no `App.js`,
`routes/*`, `src/api/*`, or `server/**` edits) and does not touch the frozen
`UISPEC.md`.
