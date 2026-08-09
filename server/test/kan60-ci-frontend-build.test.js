'use strict';

// KAN-60: [tech-debt] post-merge CI fragility in the node-root frontend build step.
//
// The repository root is a Create React App ("node-root frontend"): package.json,
// src/ and public/ all live at the repo root, while the backend lives under server/.
//
// Repro of the recurring failure (evidence: KAN-57 "CI failed after merge"):
// This pre-merge gate had drifted lenient while DevAgent's build gate (the check
// that actually blocks merges) stayed strict. A feature branch with a new warning
// (an unused import, a react-hooks/exhaustive-deps warning, etc.) passed this gate
// but failed the strict gate after merge -- a green PR turned main red. The fix is
// to run the build strictly with CI=true (`CI=true npx react-scripts build`) so
// react-scripts promotes those warnings to hard errors PRE-merge, at parity with
// the merge gate -- never the lenient `npm run build` and never CI=false.
//
// This test fails on a lenient workflow (no strict CI=true build, or a CI=false
// that disables strict mode) and passes once the strict build step is applied.

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
  // The node-root CRA production build runs via `npm run build` / `react-scripts build`.
  const hasFrontendBuild = /react-scripts\s+build|npm\s+run\s+build/.test(yaml);
  assert.ok(
    hasFrontendBuild,
    'expected a node-root frontend build step invoking `npm run build` (react-scripts build)'
  );
});

test('KAN-60: node-root frontend build step must run strictly with CI=true so lint warnings fail pre-merge CI', () => {
  const yaml = fs.readFileSync(workflowPath, 'utf8');

  // Sanity: the fragile build step is present.
  const hasFrontendBuild = /react-scripts\s+build|npm\s+run\s+build/.test(yaml);
  assert.ok(
    hasFrontendBuild,
    'expected a node-root frontend build step (npm run build / react-scripts build)'
  );

  // The build must run strictly with CI=true applied to the react-scripts build so
  // ESLint/webpack warnings fail here PRE-merge (KAN-57), at parity with the merge
  // gate -- and must never disable strict mode with CI=false.
  const runsCiTrue = /CI=true[^\n]*react-scripts\s+build/.test(yaml);
  const disablesCi = /CI=false/.test(yaml);

  assert.ok(
    runsCiTrue,
    'node-root frontend build step must run `CI=true npx react-scripts build` so ' +
      'ESLint/webpack warnings fail pre-merge CI (KAN-60). No strict `CI=true ... ' +
      'react-scripts build` found in devagent-ci.yml.'
  );
  assert.ok(
    !disablesCi,
    'node-root frontend build step must not set CI=false -- that disables strict ' +
      'mode and lets warnings slip through to post-merge CI (KAN-60).'
  );
});
