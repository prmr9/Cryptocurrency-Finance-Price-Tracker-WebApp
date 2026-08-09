'use strict';

// KAN-60: [tech-debt] post-merge CI fragility in the node-root frontend build step.
//
// The repository root is a Create React App ("node-root frontend"): package.json,
// src/ and public/ all live at the repo root, while the backend lives under server/.
//
// Repro of the recurring failure (evidence: KAN-57 "CI failed after merge"):
// GitHub Actions exports CI=true. Under CI=true, `react-scripts build` promotes
// every ESLint / webpack warning to a hard error. A feature branch can be green on
// its own, but once it is merged to main and a new warning appears (an unused import,
// a react-hooks/exhaustive-deps warning, etc.), the node-root frontend build step
// fails -- a green PR turns main red. The fix is to run that build step strictly with
// CI=true pre-merge, so the same warnings fail the PR build and are caught before merge.
//
// This test fails on a workflow that disables strict mode (CI=false) or shells the
// build through `npm run build`, and passes once it runs `CI=true npx react-scripts build`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'devagent-ci.yml'
);

test('KAN-60: devagent-ci.yml workflow exists', () => {
  assert.ok(
    fs.existsSync(workflowPath),
    `expected CI workflow at ${workflowPath}`
  );
});

test('KAN-60: node-root frontend build step defines a build command', () => {
  const yaml = fs.readFileSync(workflowPath, 'utf8');
  // The node-root CRA production build must run strictly with CI=true so react-scripts
  // promotes eslint/webpack warnings to hard errors; a bare `npm run build` defaults to
  // CI=false and would let a new warning pass pre-merge only to fail post-merge (KAN-57).
  const hasFrontendBuild = /CI=true[^\n]*react-scripts\s+build/.test(yaml);
  assert.ok(
    hasFrontendBuild,
    'expected a node-root frontend build step invoking `CI=true ... react-scripts build`'
  );
});

test('KAN-60: node-root frontend build step must run with CI=true so lint warnings are caught pre-merge', () => {
  const yaml = fs.readFileSync(workflowPath, 'utf8');

  // Sanity: the fragile build step is present.
  const hasFrontendBuild = /react-scripts\s+build|npm\s+run\s+build/.test(yaml);
  assert.ok(
    hasFrontendBuild,
    'expected a node-root frontend build step (npm run build / react-scripts build)'
  );

  // Under GitHub Actions (CI=true), react-scripts treats warnings as errors. The
  // build step must run strictly with CI=true so a new warning fails the PR build
  // pre-merge instead of only surfacing post-merge (KAN-57) — e.g.
  // `CI=true npx react-scripts build`.
  const runsStrict = /CI=true[^\n]*react-scripts\s+build/.test(yaml);
  assert.ok(
    runsStrict,
    'node-root frontend build step must run `CI=true ... react-scripts build` so ESLint/webpack ' +
      'warnings are caught pre-merge (KAN-60). No strict CI=true build found in devagent-ci.yml.'
  );

  // ...and it must NOT disable strict mode.
  assert.ok(
    !/CI=false/.test(yaml),
    'the workflow must not disable strict mode with CI=false (KAN-60).'
  );
});
