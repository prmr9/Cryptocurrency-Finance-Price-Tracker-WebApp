/**
 * KAN-74 — Resolve decomposition gaps for EPIC (regression test).
 *
 * Reproduces the decomposition-repair gap: the 5 quarantined story specs
 * (T2, T5, T6, T7, T8) must be re-filed into a VALID decomposition at
 * docs/decomposition/kan74-refiled-decomposition.json.
 *
 * On the current (buggy) tree that file does not exist, and the original
 * specs still (a) carry the slash form "handled/partial/missing" — which the
 * decomposition-validator parses as a phantom produced-by-nobody artifact
 * "/partial/missing" and rejects on — and (b) key the #state-coverage-matrix
 * and #route-map anchors to the FROZEN UISPEC.md instead of the non-frozen
 * PHASE1-IA.md companion doc. So this suite fails today.
 *
 * It passes only once the gap is resolved per the approved acceptance
 * criteria: the JSON exists, T2's matrix AC marks cells "one of: handled,
 * partial, missing, or n/a" (no slash / no path-parseable enum) with rows
 * enumerated from the App.js router source, the anchors are re-keyed to
 * PHASE1-IA.md, and the consumer->producer graph is resolvable and acyclic.
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

const KNOWN_STORIES = new Set(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']);
const STATE_COLUMNS = [
  'loading',
  'error',
  'empty',
  'success',
  'offline',
  'permission-denied',
];
const ANCHORS = ['#state-coverage-matrix', '#route-map'];

// Loads the re-filed decomposition. Throws (failing the test) when the file
// is absent — which is exactly the un-resolved-gap state this bug describes.
function loadStories() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.stories)) return data.stories;
  if (data && Array.isArray(data.specs)) return data.specs;
  throw new Error(
    'kan74-refiled-decomposition.json must contain an array of story specs'
  );
}

function loadAppSource() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

function byKey(stories, key) {
  return stories.find((s) => s && s.key === key);
}

describe('KAN-74 re-filed decomposition', () => {
  test('re-filed decomposition JSON and src/App.js are present with all 5 quarantined specs', () => {
    expect(fs.existsSync(JSON_PATH)).toBe(true);
    expect(fs.existsSync(APP_PATH)).toBe(true);

    const stories = loadStories();
    expect(stories.length).toBeGreaterThan(0);
    for (const key of ['T2', 'T5', 'T6', 'T7', 'T8']) {
      expect(byKey(stories, key)).toBeTruthy();
    }
  });

  test('(a) T2 AC#1 marks cells "one of: handled, partial, missing, or n/a" — no slash form, no path-parseable enum', () => {
    const t2 = byKey(loadStories(), 'T2');
    expect(t2).toBeTruthy();
    const ac1 = t2.acceptance_criteria[0];

    expect(ac1).toContain('one of: handled, partial, missing, or n/a');
    expect(ac1).not.toContain('handled/partial/missing');
    expect(ac1).not.toContain('/partial/missing');

    // No path-parseable enum: no braced set whose members are route paths
    // (a member that begins with '/'). The state-column enum and any
    // {handled, partial, missing, n/a} enum have no path-like members.
    const braceGroups = ac1.match(/\{[^}]*\}/g) || [];
    for (const group of braceGroups) {
      const members = group
        .replace(/^\{/, '')
        .replace(/\}$/, '')
        .split(',')
        .map((m) => m.trim());
      for (const member of members) {
        expect(member.startsWith('/')).toBe(false);
      }
    }
  });

  test('(d) T2 AC#1 derives matrix rows from the App.js <Route> source and lists the six state columns', () => {
    const ac1 = byKey(loadStories(), 'T2').acceptance_criteria[0];
    const app = loadAppSource();

    // Row count is derived from the parsed App.js <Route> elements — not a
    // fixed literal count. A screen-coverage matrix must have >= 1 row.
    const routeCount = (app.match(/<Route\b/g) || []).length;
    expect(routeCount).toBeGreaterThan(0);

    expect(ac1).toMatch(/App\.js/);
    expect(ac1.toLowerCase()).toContain('one row per screen');
    expect(ac1.toLowerCase()).toMatch(/no fixed count|enumerated from the app\.js/);

    for (const col of STATE_COLUMNS) {
      expect(ac1).toContain(col);
    }
  });

  test('T2 AC#1 is a dated snapshot with a re-audit trigger, living in the non-frozen PHASE1-IA.md companion doc', () => {
    const ac1 = byKey(loadStories(), 'T2').acceptance_criteria[0];
    expect(ac1).toMatch(/PHASE1-IA\.md/);
    expect(ac1.toLowerCase()).toContain('snapshot');
    expect(ac1).toMatch(/\b20\d{2}\b/);
    expect(ac1.toLowerCase()).toMatch(/re-?audit|trigger|regenerat|recompile/);
    expect(ac1.toLowerCase()).toMatch(/companion|non-frozen/);
  });

  test('(b) every depends_on target resolves to T1–T8 with the exact acyclic consumer→producer graph', () => {
    const stories = loadStories();

    const EXPECTED_EDGES = {
      T2: ['T1'],
      T5: ['T1', 'T2', 'T3', 'T4'],
      T6: ['T2', 'T3', 'T4'],
      T7: ['T2', 'T4', 'T5', 'T6'],
      T8: ['T7'],
    };

    const nodes = new Set();
    const edges = {};
    for (const s of stories) {
      nodes.add(s.key);
      const deps = Array.isArray(s.depends_on) ? s.depends_on : [];
      edges[s.key] = deps;
      for (const d of deps) {
        nodes.add(d);
        expect(KNOWN_STORIES.has(d)).toBe(true); // resolvable to a known story
      }
    }

    for (const [key, deps] of Object.entries(EXPECTED_EDGES)) {
      const s = byKey(stories, key);
      expect(s).toBeTruthy();
      expect([...(s.depends_on || [])].sort()).toEqual([...deps].sort());
    }

    // Acyclic (three-colour DFS).
    const color = {};
    for (const n of nodes) color[n] = 0;
    let cycle = false;
    const visit = (u) => {
      color[u] = 1;
      for (const v of edges[u] || []) {
        if (color[v] === 1) cycle = true;
        else if (color[v] === 0) visit(v);
      }
      color[u] = 2;
    };
    for (const n of nodes) if (color[n] === 0) visit(n);
    expect(cycle).toBe(false);
  });

  test('#state-coverage-matrix and #route-map are keyed to PHASE1-IA.md, never the frozen UISPEC.md', () => {
    const blob = JSON.stringify(loadStories());
    for (const anchor of ANCHORS) {
      expect(blob).not.toContain('UISPEC.md' + anchor);
      expect(blob).toContain('PHASE1-IA.md' + anchor);
    }
  });

  test('(c) each anchor is produced by exactly one story and never consumed by its own producer', () => {
    const stories = loadStories();
    for (const anchor of ANCHORS) {
      const producers = stories.filter(
        (s) => typeof s.summary === 'string' && s.summary.includes(anchor)
      );
      expect(producers.length).toBe(1); // produced by exactly one story

      const producer = producers[0];
      // A producer must not depend on itself...
      expect(producer.depends_on || []).not.toContain(producer.key);
      // ...nor on another story that also produces the same artifact.
      for (const dep of producer.depends_on || []) {
        const depStory = byKey(stories, dep);
        if (depStory && typeof depStory.summary === 'string') {
          expect(depStory.summary.includes(anchor)).toBe(false);
        }
      }
    }
  });
});
