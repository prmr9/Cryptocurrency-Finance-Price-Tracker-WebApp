/**
 * KAN-74 — in-repo dry-run of the DevAgent decomposition-validator.
 *
 * The EPIC decomposition was REJECTED on a single false-positive edge: the enum
 * `handled/partial/missing` inside T2's matrix AC was parsed as an artifact PATH
 * `/partial/missing` that no story produced, so the ladder dropped T2 + its
 * transitive dependents T5..T8. This guard loads the re-filed decomposition DATA
 * (not app code) plus src/App.js and asserts the corrections hold, so the
 * mis-parse can never regress and the graph stays valid before any story starts.
 *
 * It lives in src/__tests__ so it runs under the existing react-scripts jest CI
 * job. It reads UISPEC.md read-only and never mutates it.
 */
const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const DECOMP_PATH = path.join(
  REPO_ROOT,
  'docs',
  'decomposition',
  'kan74-refiled-decomposition.json'
)
const APP_PATH = path.join(REPO_ROOT, 'src', 'App.js')

// NEW Phase-1 audit anchors that must live in the non-frozen companion doc.
const TRACKED_ANCHORS = ['state-coverage-matrix', 'route-map']
const KNOWN_STORY_IDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']

const readDecomp = () => JSON.parse(fs.readFileSync(DECOMP_PATH, 'utf8'))
const readApp = () => fs.readFileSync(APP_PATH, 'utf8')

// Producer of an anchor = the single story whose summary declares it.
const producerOf = (stories, anchor) =>
  stories.filter((s) => s.summary.includes(anchor))

// Every story that references an anchor anywhere in its acceptance criteria.
const referencesAnchor = (story, anchor) =>
  story.acceptance_criteria.some((ac) => ac.includes(anchor))

// Screens enumerated from the App.js router source: one entry per <Route path=..>,
// collapsing the '/coin' wrapper with its nested ':coinId' child into the single
// reachable coin-detail surface. Derived, never a hardcoded literal.
const screensFromRouter = (appSource) => {
  const paths = (appSource.match(/<Route\s+[^>]*path=['"]([^'"]+)['"]/g) || []).map(
    (m) => m.replace(/.*path=['"]([^'"]+)['"].*/, '$1')
  )
  const canonical = new Set()
  for (const p of paths) {
    // ':coinId' is the nested child of the '/coin' wrapper — the reachable
    // detail URL is '/coin/:coinId'; both map to one coin-detail screen.
    if (p === ':coinId' || p === '/coin') {
      canonical.add('/coin/:coinId')
    } else {
      canonical.add(p)
    }
  }
  return { rawRoutePaths: paths, canonicalScreens: [...canonical] }
}

describe('KAN-74 — re-filed decomposition validator dry-run', () => {
  it('loads the re-filed decomposition and the App router source', () => {
    expect(fs.existsSync(DECOMP_PATH)).toBe(true)
    expect(fs.existsSync(APP_PATH)).toBe(true)
    const { stories } = readDecomp()
    expect(Array.isArray(stories)).toBe(true)
    // The 5 dropped specs, re-filed.
    expect(stories.map((s) => s.key).sort()).toEqual(['T2', 'T5', 'T6', 'T7', 'T8'])
  })

  // (a) anti-regression on the '/partial/missing' mis-parse.
  it('(a) de-pathifies T2 AC#1 — no slash-enum the validator can read as a path', () => {
    const { stories } = readDecomp()
    const t2 = stories.find((s) => s.key === 'T2')
    const ac1 = t2.acceptance_criteria[0]
    expect(ac1).toContain('one of: handled, partial, missing, or n/a')
    // The exact forms the validator mis-parsed must be absent.
    expect(ac1).not.toMatch(/handled\/partial\/missing/)
    expect(ac1).not.toContain('/partial/missing')
    // And no bare slash-enum path survives in any story's acceptance criteria —
    // the acceptance criteria are exactly what the validator parses for artifact
    // producers (the human-readable `note` prose that recounts the bug is not).
    for (const s of stories) {
      for (const ac of s.acceptance_criteria) {
        expect(ac).not.toContain('/partial/missing')
        expect(ac).not.toMatch(/handled\/partial\/missing/)
      }
    }
  })

  // (b) acyclic graph, all depends_on targets resolvable to a known story.
  it('(b) has an acyclic dependency graph with every target resolvable', () => {
    const { stories } = readDecomp()
    const nodeKeys = new Set(stories.map((s) => s.key))
    const depsByKey = new Map(stories.map((s) => [s.key, s.depends_on]))

    // Every declared edge points at a known story id (T1..T8).
    for (const s of stories) {
      for (const target of s.depends_on) {
        expect(KNOWN_STORY_IDS).toContain(target)
      }
    }

    // The exact edge set the ticket fixes must be preserved verbatim.
    expect(depsByKey.get('T2')).toEqual(['T1'])
    expect(depsByKey.get('T5')).toEqual(['T1', 'T2', 'T3', 'T4'])
    expect(depsByKey.get('T6')).toEqual(['T2', 'T3', 'T4'])
    expect(depsByKey.get('T7')).toEqual(['T2', 'T4', 'T5', 'T6'])
    expect(depsByKey.get('T8')).toEqual(['T7'])

    // Kahn topological sort over the internal nodes (external roots T1/T3/T4 are
    // already-satisfied producers not present as nodes here). A remaining node
    // means a cycle.
    const indeg = new Map([...nodeKeys].map((k) => [k, 0]))
    for (const s of stories) {
      for (const target of s.depends_on) {
        if (nodeKeys.has(target)) indeg.set(s.key, indeg.get(s.key) + 1)
      }
    }
    const queue = [...nodeKeys].filter((k) => indeg.get(k) === 0)
    let visited = 0
    while (queue.length) {
      const k = queue.shift()
      visited += 1
      for (const s of stories) {
        if (s.depends_on.includes(k) && nodeKeys.has(s.key)) {
          indeg.set(s.key, indeg.get(s.key) - 1)
          if (indeg.get(s.key) === 0) queue.push(s.key)
        }
      }
    }
    expect(visited).toBe(nodeKeys.size)
  })

  // (c) no story consumes an artifact it solely produces; consumers depend on
  //     the producer (no self-satisfying producer/consumer edge).
  it('(c) each tracked anchor has one producer, never self-consumed', () => {
    const { stories } = readDecomp()
    for (const anchor of TRACKED_ANCHORS) {
      const producers = producerOf(stories, anchor)
      // produced by exactly one story
      expect(producers.length).toBe(1)
      const producer = producers[0]
      // the producer does not list itself as a dependency
      expect(producer.depends_on).not.toContain(producer.key)
      // every consumer (references it but does not produce it) depends on producer
      const consumers = stories.filter(
        (s) => s.key !== producer.key && referencesAnchor(s, anchor)
      )
      for (const c of consumers) {
        expect(c.depends_on).toContain(producer.key)
      }
    }
  })

  // (d) new anchors keyed to PHASE1-IA.md, and matrix row count router-derived.
  it('(d) keys new anchors to PHASE1-IA.md and derives the matrix row count from App.js routes', () => {
    const whole = fs.readFileSync(DECOMP_PATH, 'utf8')
    for (const anchor of TRACKED_ANCHORS) {
      // No reference keeps these new anchors on the frozen UISPEC.md.
      expect(whole).not.toContain(`UISPEC.md#${anchor}`)
      // Every reference is homed on the non-frozen companion doc.
      expect(whole).toContain(`PHASE1-IA.md#${anchor}`)
    }

    const { stories } = readDecomp()
    const ac1 = stories.find((s) => s.key === 'T2').acceptance_criteria[0]
    // Row count is expressed router-derived, never a fixed literal.
    expect(ac1).toContain('one row per screen')
    expect(ac1).toContain('App.js')
    expect(ac1).toMatch(/enumerated from the App\.js router source|derived from the App\.js <Route> elements/)
    expect(ac1).not.toMatch(/exactly (four|4) (rows|screens)/i)
    // Prove-against-router: the screen set is parsed from App.js, not hardcoded.
    const { rawRoutePaths, canonicalScreens } = screensFromRouter(readApp())
    expect(rawRoutePaths.length).toBeGreaterThanOrEqual(1)
    expect(canonicalScreens).toEqual(
      expect.arrayContaining(['/', '/accounts', '/about', '/coin/:coinId'])
    )
    // Snapshot + re-audit trigger clause is present (reviewer points 3 & 4).
    expect(ac1).toContain('2026-08-15')
    expect(ac1).toMatch(/re-audited whenever App\.js/)
  })
})
