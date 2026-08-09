'use strict';

// Regression test for KAN-60: post-merge CI fragility.
//
// The node-root (Create React App) frontend build must run `react-scripts build`
// directly with CI=true so that CRA/ESLint warnings are surfaced deterministically
// and the post-merge CI build does not flake. It must NOT go through `npm run build`
// (an indirection that hides the real command) and must NOT disable CI checks with
// CI=false.
//
// Acceptance criteria (KAN-60, fix pass 2):
//   Given .github/workflows/devagent-ci.yml
//   When the node-root frontend build step is inspected
//   Then it runs the build with CI=true (e.g. `CI=true npx react-scripts build`)
//        and the file contains no `npm run build` invocation and no `CI=false`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// server/test/ -> repo root is two levels up.
const workflowPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'devagent-ci.yml'
);

function readWorkflow() {
  assert.ok(
    fs.existsSync(workflowPath),
    `expected CI workflow at ${workflowPath}`
  );
  return fs.readFileSync(workflowPath, 'utf8');
}

test('devagent-ci frontend build runs react-scripts build with CI=true', () => {
  const contents = readWorkflow();
  assert.match(
    contents,
    /CI=true\s+(?:npx\s+)?react-scripts\s+build/,
    'expected the node-root frontend build to run `CI=true npx react-scripts build`'
  );
});

test('devagent-ci does not build via `npm run build`', () => {
  const contents = readWorkflow();
  assert.doesNotMatch(
    contents,
    /npm\s+run\s+build/,
    'frontend build must invoke react-scripts directly, not `npm run build`'
  );
});

test('devagent-ci does not disable CI checks with CI=false', () => {
  const contents = readWorkflow();
  assert.doesNotMatch(
    contents,
    /CI=false/,
    'CI must not be disabled for the build; use CI=true so warnings are enforced'
  );
});
