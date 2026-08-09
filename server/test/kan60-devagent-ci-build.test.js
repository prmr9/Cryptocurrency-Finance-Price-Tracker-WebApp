'use strict';

// Regression test for KAN-60: post-merge CI fragility in devagent-ci.yml.
//
// The node-root (frontend) build step in .github/workflows/devagent-ci.yml must
// build the CRA app deterministically with `CI=true npx react-scripts build`.
// The fragile variants that caused post-merge CI failures (KAN-57) were shelling
// out through `npm run build` and/or disabling CI mode with `CI=false`. Neither
// may appear in the workflow.
//
// This test FAILS on the current (buggy) workflow and passes once the build step
// is changed to `CI=true npx react-scripts build`.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Resolve the test runner primitive so this file works under both `node --test`
// (server suite) and Jest, without assuming which runner executes it.
const test =
  typeof global !== 'undefined' && typeof global.test === 'function'
    ? global.test
    : require('node:test').test;

const WORKFLOW_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'devagent-ci.yml'
);

test('KAN-60: devagent-ci frontend build runs `CI=true npx react-scripts build` (no `npm run build`, no `CI=false`)', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');

  // The frontend build must invoke react-scripts directly...
  assert.ok(
    /react-scripts build/.test(workflow),
    'expected the frontend build step to invoke `react-scripts build` directly'
  );

  // ...with CI mode explicitly enabled, applied to the build invocation.
  assert.ok(
    /CI=true[^\n]*react-scripts build/.test(workflow),
    'expected `CI=true` to be applied to the `react-scripts build` invocation (e.g. `CI=true npx react-scripts build`)'
  );

  // It must NOT shell out through `npm run build`.
  assert.ok(
    !/npm run build/.test(workflow),
    'expected no `npm run build` invocation in .github/workflows/devagent-ci.yml'
  );

  // It must NOT disable CI mode.
  assert.ok(
    !/CI=false/.test(workflow),
    'expected no `CI=false` in .github/workflows/devagent-ci.yml'
  );
});
