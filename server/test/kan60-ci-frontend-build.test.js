const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Regression test for KAN-60: post-merge CI fragility.
//
// Evidence: KAN-57 (CI failed after merge). The node-root (frontend) build step
// in the devagent CI workflow must run react-scripts directly with CI=true so
// warnings fail fast and deterministically, instead of shelling out to
// `npm run build` (which inherits an ambient/implicit CI value and made the
// post-merge build fragile) or force-disabling strictness with CI=false.
//
// This test FAILS on the current workflow and passes once the build step is
// changed to `CI=true npx react-scripts build`.
const WORKFLOW_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'devagent-ci.yml',
);

test('KAN-60: devagent-ci node-root frontend build runs react-scripts with CI=true', () => {
  const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');

  // The frontend build must be invoked with CI=true and react-scripts directly,
  // e.g. `CI=true npx react-scripts build`.
  assert.match(
    raw,
    /CI=true\s+(?:npx\s+)?react-scripts\s+build/,
    'Expected the node-root frontend build to run with `CI=true npx react-scripts build` in .github/workflows/devagent-ci.yml',
  );

  // The workflow must not shell out to `npm run build` for the frontend build.
  assert.ok(
    !raw.includes('npm run build'),
    'devagent-ci.yml must not invoke `npm run build`; run `CI=true npx react-scripts build` directly instead',
  );

  // The workflow must not disable CI strictness with CI=false.
  assert.ok(
    !raw.includes('CI=false'),
    'devagent-ci.yml must not use `CI=false`; the frontend build must run with CI=true',
  );
});
