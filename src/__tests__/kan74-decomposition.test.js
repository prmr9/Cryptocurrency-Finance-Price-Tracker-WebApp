/**
 * KAN-74 — Resolve decomposition gaps for EPIC.
 *
 * Regression test for the dropped/quarantined story specs. Automated
 * decomposition repair dropped T2 (and its transitive dependents T5–T8)
 * because T2's acceptance criterion #1 wrote the state enum as the slash form
 * "handled/partial/missing", which the decomposition-validator parsed as a
 * phantom artifact path "/partial/missing" that no story produces:
 *
 *   "no story in this decomposition produces /partial/missing,
 *    referenced by T2's AC"  ->  Decomposition validation: REJECTED
 *
 * The fix re-files the quarantined specs into
 *   docs/decomposition/kan74-refiled-decomposition.json
 * with:
 *   (a) T2 AC#1's enum written as a non-path-parseable list
 *       "one of: handled, partial, missing, or n/a",
 *   (b) an acyclic consumer->producer graph whose depends_on targets all
 *       resolve to known stories T1–T8,
 *   (c) the #state-coverage-matrix / #route-map anchors re-keyed to the
 *       non-frozen companion doc PHASE1-IA.md, each produced by exactly one
 *       story and never consumed by its own producer, and
 *   (d) a matrix whose rows are enumerated per-screen from the App.js router
 *       source (no fixed count).
 *
 * This suite therefore FAILS on the current (still-buggy) tree — the re-filed
 * decomposition JSON does not exist / still carries the phantom slash enum and
 * UISPEC.md anchors — and only passes once the gap is resolved as WORK.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DECOMP_PATH = path.join(
  REPO_ROOT,
  'docs',
  'decomposition',
  'kan74-refiled-decomposition.json'
);
const APP_PATH = path.resolve(__dirname, '..', 'App.js');

// The full universe of stories the decomposition is allowed to reference.
const KNOWN_STORIES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

// Approved consumer->producer edges for the re-filed specs.
const EXPECTED_EDGES = {
  T2: ['T1'],
  T5: ['T1', 'T2', 'T3', 'T4'],
  T6: ['T2', 'T3', 'T4'],
  T7: ['T2', 'T4', 'T5', 'T6'],
  T8: ['T7'],
};

// Anchors that must move off the frozen UISPEC.md onto PHASE1-IA.md.
const ANCHORS = ['#state-coverage-matrix', '#route-map'];

// State columns the matrix must carry, one column per state.
const COLUMN_PATTERNS = {
  loading: /loading/i,
  error: /error/i,
  empty: /empty/i,
  success: /success/i,
  offline: /offline/i,
  'permission-denied': /permission[-\s]?denied/i,
};

function loadDecomp() {
  // On the current buggy tree this file does not exist, so this fails first
  // and the whole suite reproduces the unresolved-gap state.
  expect(fs.existsSync(DECOMP_PATH)).toBe(true);
  const raw = fs.readFileSync(DECOMP_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const stories = Array.isArray(parsed)
    ? parsed
    : parsed.stories || parsed.specs || parsed.story_specs || [];
  expect(Array.isArray(stories)).toBe(true);
  expect(stories.length).toBeGreaterThan(0);
  return { raw, stories };
}

function byKey(stories, key) {
  return stories.find((s) => s && s.key === key);
}

function firstAc(story) {
  expect(story).toBeDefined();
  expect(Array.isArray(story.acceptance_criteria)).toBe(true);
  expect(typeof story.acceptance_criteria[0]).toBe('string');
  return story.acceptance_criteria[0];
}

function acText(story) {
  const list =
    story && Array.isArray(story.acceptance_criteria)
      ? story.acceptance_criteria
      : [];
  return list.join('\n');
}

// (d) row count is derived from the parsed App.js <Route> elements.
function countRouteElements(appSrc) {
  return (appSrc.match(/<Route\b/g) || []).length;
}

function hasCycle(stories) {
  const graph = {};
  stories.forEach((s) => {
    graph[s.key] = Array.isArray(s.depends_on) ? s.depends_on : [];
  });
  const nodes = new Set(Object.keys(graph));
  Object.values(graph).forEach((deps) => deps.forEach((d) => nodes.add(d)));

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = {};
  nodes.forEach((n) => {
    color[n] = WHITE;
  });

  let cyclic = false;
  function dfs(u) {
    color[u] = GRAY;
    (graph[u] || []).forEach((v) => {
      if (color[v] === GRAY) cyclic = true;
      else if (color[v] === WHITE) dfs(v);
    });
    color[u] = BLACK;
  }
  nodes.forEach((n) => {
    if (color[n] === WHITE) dfs(n);
  });
  return cyclic;
}

describe('KAN-74 re-filed decomposition', () => {
  test('re-files the quarantined story specs T2, T5, T6, T7, T8', () => {
    const { stories } = loadDecomp();
    ['T2', 'T5', 'T6', 'T7', 'T8'].forEach((key) => {
      expect(byKey(stories, key)).toBeDefined();
    });
  });

  test('(a) T2 AC#1 drops the path-parseable "/partial/missing" enum', () => {
    const { raw, stories } = loadDecomp();
    const ac1 = firstAc(byKey(stories, 'T2'));

    // The approved non-path enum wording must be present verbatim...
    expect(ac1).toContain('one of: handled, partial, missing, or n/a');

    // ...and the slash form that the validator mis-parsed as an artifact
    // path must be gone entirely.
    expect(ac1).not.toContain('handled/partial/missing');
    expect(ac1).not.toContain('/partial/missing');
    expect(
      /(handled|partial|missing)\s*\/\s*(handled|partial|missing)/i.test(ac1)
    ).toBe(false);

    // No re-filed spec may reintroduce the phantom artifact anywhere.
    const allAcs = stories.map(acText).join('\n');
    expect(allAcs).not.toContain('/partial/missing');

    // ...and it must not survive anywhere else in the decomposition DATA
    // either — the note field previously re-injected the exact phantom path
    // token, which the over-matching validator re-parsed as a required artifact.
    expect(raw).not.toContain('/partial/missing');
    expect(raw).not.toContain('handled/partial/missing');
  });

  test('(b) graph is acyclic and every depends_on resolves to T1–T8', () => {
    const { stories } = loadDecomp();

    stories.forEach((s) => {
      expect(Array.isArray(s.depends_on)).toBe(true);
      s.depends_on.forEach((dep) => {
        expect(KNOWN_STORIES).toContain(dep);
      });
      // A story may never depend on itself (would consume what it produces).
      expect(s.depends_on).not.toContain(s.key);
    });

    // Exact approved edges for the re-filed specs.
    Object.keys(EXPECTED_EDGES).forEach((key) => {
      const s = byKey(stories, key);
      if (s) {
        expect([...s.depends_on].sort()).toEqual(
          [...EXPECTED_EDGES[key]].sort()
        );
      }
    });

    expect(hasCycle(stories)).toBe(false);
  });

  test('(c) matrix/route-map anchors re-keyed to PHASE1-IA.md, produced once, never self-consumed', () => {
    const { raw, stories } = loadDecomp();

    ANCHORS.forEach((anchor) => {
      // Every reference is keyed to the non-frozen companion doc, not UISPEC.md.
      expect(raw).toContain('PHASE1-IA.md' + anchor);
      expect(raw).not.toContain('UISPEC.md' + anchor);
      const withoutKeyed = raw.split('PHASE1-IA.md' + anchor).join('');
      expect(withoutKeyed.includes(anchor)).toBe(false);

      // Produced by exactly one story (named in its summary).
      const producers = stories.filter((s) =>
        (s.summary || '').includes('PHASE1-IA.md' + anchor)
      );
      expect(producers.length).toBe(1);
      const producer = producers[0];

      // Consumers reference it in their ACs and must depend on the producer;
      // the producer never consumes the artifact it solely produces.
      const consumers = stories.filter(
        (s) => s.key !== producer.key && acText(s).includes(anchor)
      );
      consumers.forEach((c) => {
        expect(c.depends_on).toContain(producer.key);
      });
      expect(producer.depends_on).not.toContain(producer.key);
    });
  });

  test('(d) matrix rows enumerated per-screen from the App.js router (no fixed count)', () => {
    const { stories } = loadDecomp();

    // Derive the screen count from the actual parsed <Route> elements.
    expect(fs.existsSync(APP_PATH)).toBe(true);
    const appSrc = fs.readFileSync(APP_PATH, 'utf8');
    const routeCount = countRouteElements(appSrc);
    expect(routeCount).toBeGreaterThan(0);

    const ac1 = firstAc(byKey(stories, 'T2'));

    // One row per screen, enumerated from App.js — and no hard-coded count.
    expect(/one row per screen/i.test(ac1)).toBe(true);
    expect(/App\.js/.test(ac1)).toBe(true);
    expect(/\b\d+\s+(rows?|screens?)\b/i.test(ac1)).toBe(false);

    // One column per state.
    Object.entries(COLUMN_PATTERNS).forEach(([, re]) => {
      expect(re.test(ac1)).toBe(true);
    });
  });

  test('T2 AC#1 carries the point-in-time snapshot + re-audit clause on PHASE1-IA.md', () => {
    const { stories } = loadDecomp();
    const ac1 = firstAc(byKey(stories, 'T2'));

    // A named snapshot date...
    expect(/snapshot/i.test(ac1)).toBe(true);
    expect(
      /\b\d{4}\b/.test(ac1) ||
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
          ac1
        )
    ).toBe(true);

    // ...a re-audit trigger when App.js or routes change...
    expect(/change/i.test(ac1)).toBe(true);

    // ...and the matrix living in the non-frozen companion doc.
    expect(/PHASE1-IA\.md/.test(ac1)).toBe(true);
  });
});
