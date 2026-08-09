/**
 * Regression test for KAN-60 — post-merge CI fragility.
 *
 * The node-root (frontend) build step in .github/workflows/devagent-ci.yml must
 * run react-scripts in strict CI mode so lint/type warnings fail the build
 * deterministically BEFORE merge, instead of surfacing only after merge
 * (see KAN-57: "CI failed after merge").
 *
 * Acceptance criteria being guarded:
 *   - the frontend build runs with CI=true (e.g. `CI=true npx react-scripts build`)
 *   - the workflow contains NO `npm run build` invocation
 *   - the workflow contains NO `CI=false`
 *
 * These assertions read the real workflow file and fail on the current
 * (still-buggy) configuration.
 */
const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'devagent-ci.yml'
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

describe('KAN-60: devagent-ci.yml frontend build is CI-strict', () => {
  test('the devagent CI workflow file exists', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
  });

  test('does not invoke `npm run build` (masks react-scripts CI semantics)', () => {
    expect(readWorkflow()).not.toMatch(/npm run build/);
  });

  test('never disables strict CI mode via CI=false', () => {
    expect(readWorkflow()).not.toMatch(/CI=false/);
  });

  test('runs the frontend build as `CI=true ... react-scripts build`', () => {
    const workflow = readWorkflow();
    expect(workflow).toMatch(/react-scripts build/);
    expect(workflow).toMatch(/CI=true/);
    // CI=true must apply to the react-scripts build invocation itself.
    expect(workflow).toMatch(/CI=true[^\n]*react-scripts build/);
  });
});
