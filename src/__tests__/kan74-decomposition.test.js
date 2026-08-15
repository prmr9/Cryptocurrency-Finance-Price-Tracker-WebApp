/**
 * KAN-74: Resolve decomposition gaps for EPIC.
 *
 * The automated decomposition repair quarantined 5 story specs (T2, T5, T6,
 * T7, T8) because the decomposition validator rejected them. The root cause is
 * that T2's matrix acceptance criterion wrote the cell enum as the slash form
 * `handled/partial/missing`, which the validator parses as a required artifact
 * path `/partial/missing` that no story produces. The gap is resolved as WORK
 * by re-filing the specs into a valid, acyclic decomposition at
 * `docs/decomposition/kan74-refiled-decomposition.json`, with the enum written
 * in a non-path-parseable comma form and the `#state-coverage-matrix` /
 * `#route-map` anchors re-keyed off the frozen UISPEC.md onto PHASE1-IA.md.
 *
 * This regression test loads that re-filed decomposition and src/App.js and
 * fails on the current (unfixed) code because the re-filed decomposition does
 * not exist / still carries the quarantine defects.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const JSON_PATH = path.join(
  REPO_ROOT,
  'docs',
  'decomposition',
  'kan74-refiled-decomposition.json'
);
const APP_PATH = path.join(REPO_ROOT, 'src', 'App.js');

const ANCHORS = ['#state-coverage-matrix', '#route-map'];
const STATE_COLUMNS = [
  'loading',
  'error',
  'empty',
  'success',
  'offline',
  'permission-denied',
];

function loadStories() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const stories = Array.isArray(parsed) ? parsed : parsed.stories;
  if (!Array.isArray(stories)) {
    throw new Error(
      'kan74-refiled-decomposition.json must contain an array of story specs'
    );
  }
  return stories;
}

describe('KAN-74: re-filed decomposition resolves the validation gap', () => {
  test('the re-filed decomposition JSON exists', () => {
    // The gap must be resolved as WORK: the quarantined specs are re-filed
    // into a concrete artifact, not left as a human-review wait.
    expect(fs.existsSync(JSON_PATH)).toBe(true);
  });

  describe('given the re-filed decomposition', () => {
    let stories;
    let byKey;
    let t2;
    let rawJson;

    beforeAll(() => {
      rawJson = fs.readFileSync(JSON_PATH, 'utf8');
      stories = loadStories();
      byKey = new Map(stories.map((s) => [s.key, s]));
      t2 = byKey.get('T2');
    });

    // (a) no path-parseable enum in T2 AC#1
    test('(a) T2 AC#1 uses the comma enum, not the path-parseable slash form', () => {
      expect(t2).toBeDefined();
      const ac1 = t2.acceptance_criteria[0];
      // The corrected enum is not parseable as an artifact path.
      expect(ac1).toEqual(
        expect.stringContaining('one of: handled, partial, missing, or n/a')
      );
      // The slash form the validator mis-parsed as `/partial/missing` is gone.
      expect(ac1).not.toContain('handled/partial/missing');
      expect(ac1).not.toMatch(/\/partial\/missing/);
    });

    // (b) an acyclic graph with all depends_on targets resolvable
    test('(b) every depends_on target resolves to T1-T8 and the graph is acyclic', () => {
      for (const story of stories) {
        for (const dep of story.depends_on || []) {
          expect(dep).toMatch(/^T[1-8]$/);
        }
      }

      // DFS three-colour cycle detection over the re-filed graph.
      const WHITE = 0;
      const GRAY = 1;
      const BLACK = 2;
      const color = new Map(stories.map((s) => [s.key, WHITE]));

      const visit = (key) => {
        if (!color.has(key)) return; // external producer treated as a leaf
        if (color.get(key) === BLACK) return;
        // A GRAY node reached again is a back-edge, i.e. a cycle.
        expect(color.get(key)).not.toBe(GRAY);
        color.set(key, GRAY);
        for (const dep of byKey.get(key).depends_on || []) visit(dep);
        color.set(key, BLACK);
      };

      for (const story of stories) visit(story.key);

      // The specific consumer->producer edges the fix is defined against.
      const edgeOf = (key) =>
        new Set(byKey.get(key) ? byKey.get(key).depends_on || [] : []);
      const expectEdges = (key, expected) => {
        const actual = edgeOf(key);
        for (const producer of expected) expect(actual.has(producer)).toBe(true);
      };
      expectEdges('T2', ['T1']);
      expectEdges('T5', ['T1', 'T2', 'T3', 'T4']);
      expectEdges('T6', ['T2', 'T3', 'T4']);
      expectEdges('T7', ['T2', 'T4', 'T5', 'T6']);
      expectEdges('T8', ['T7']);
    });

    // (c) no story consumes an artifact it solely produces
    test('(c) anchors are keyed to PHASE1-IA.md and never consumed by their sole producer', () => {
      // The frozen UISPEC.md is no longer the key for these anchors.
      expect(rawJson).not.toContain('UISPEC.md#state-coverage-matrix');
      expect(rawJson).not.toContain('UISPEC.md#route-map');
      expect(rawJson).toContain('PHASE1-IA.md#state-coverage-matrix');
      expect(rawJson).toContain('PHASE1-IA.md#route-map');

      for (const anchor of ANCHORS) {
        // Each anchor is produced by exactly one story.
        const producers = stories.filter((s) =>
          (s.summary || '').includes(anchor)
        );
        expect(producers).toHaveLength(1);
        const producer = producers[0];

        for (const story of stories) {
          if (story.key === producer.key) continue;
          const consumes = (story.acceptance_criteria || []).some((ac) =>
            ac.includes(anchor)
          );
          if (consumes) {
            // A consuming story must depend on the producer, never producing
            // the artifact it consumes itself.
            expect(story.depends_on || []).toContain(producer.key);
          }
        }
      }
    });

    // (d) matrix row count is derived from parsed App.js <Route> elements
    test('(d) matrix rows are enumerated from App.js <Route> elements with no fixed count', () => {
      const appSrc = fs.readFileSync(APP_PATH, 'utf8');
      const routePaths = [
        ...appSrc.matchAll(/<Route\b[^>]*?\bpath\s*=\s*["'{]?([^"'}\s>]+)/g),
      ].map((m) => m[1]);
      // The matrix row count is derived from the router source, which must
      // actually enumerate screens.
      expect(routePaths.length).toBeGreaterThan(0);

      const ac1 = t2.acceptance_criteria[0];
      // The row source is the App.js router, not a hard-coded screen count.
      expect(ac1).toContain('App.js');
      expect(ac1).toMatch(/no fixed count|without a fixed count|not a fixed count/i);
      // One column per required state.
      for (const column of STATE_COLUMNS) {
        expect(ac1).toContain(column);
      }
    });
  });
});
