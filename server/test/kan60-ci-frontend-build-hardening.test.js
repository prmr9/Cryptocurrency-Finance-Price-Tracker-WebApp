'use strict';

// KAN-60 — post-merge CI fragility in the node-root frontend build step.
//
// The repository root is a Create React App project. In
// .github/workflows/devagent-ci.yml the root ("node-root") frontend build step
// runs `react-scripts build` directly. GitHub Actions sets CI=true for every
// step by default, and under CI=true react-scripts treats ESLint warnings as
// build-breaking errors. KAN-57 ("CI failed after merge") recorded the failure
// mode where a warning-laden PR was green pre-merge yet broke post-merge.
//
// KAN-60 closes that gap by keeping the build CI-strict pre-merge: the node-root
// frontend build step must run under CI=true (e.g. `CI=true npx react-scripts
// build`) so a stray warning fails this gate before it can merge, and must never
// neutralise strictness with CI=false.
//
// This regression test asserts that CI-strict behaviour. It FAILS while the build
// step disables strict CI (CI=false) and passes once it runs under CI=true.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'devagent-ci.yml',
);

function readWorkflow() {
  assert.ok(
    fs.existsSync(WORKFLOW_PATH),
    `Expected CI workflow file at ${WORKFLOW_PATH}`,
  );
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

const FRONTEND_BUILD = /(npm run build|yarn build|react-scripts build)/;

test('devagent-ci defines a node-root frontend build step', () => {
  const workflow = readWorkflow();
  assert.match(
    workflow,
    FRONTEND_BUILD,
    'devagent-ci.yml should contain a node-root frontend build step',
  );
});

test('node-root frontend build step keeps CRA treat-warnings-as-errors (CI=true)', () => {
  const workflow = readWorkflow();

  // Sanity: we are asserting against a real frontend build step.
  assert.match(
    workflow,
    FRONTEND_BUILD,
    'devagent-ci.yml should contain a node-root frontend build step',
  );

  // The fix: the frontend build step must run CI-strict (CI=true) so react-scripts
  // fails the build on ESLint warnings introduced by a merge — catching them on the
  // pre-merge gate instead of post-merge (KAN-57). It must never neutralise that
  // with CI=false.
  const ciStrict = /\bCI\s*[:=]\s*["']?true["']?/i;
  const ciDisabled = /\bCI\s*[:=]\s*["']?(?:false|0)["']?/i;

  assert.match(
    workflow,
    ciStrict,
    'The node-root frontend build step must set CI=true so that ESLint ' +
      'warnings introduced by a merge fail the pre-merge CI build ' +
      '(KAN-60 / KAN-57 post-merge CI fragility).',
  );
  assert.doesNotMatch(
    workflow,
    ciDisabled,
    'The node-root frontend build step must not disable strict CI with CI=false.',
  );
});
