'use strict';

// KAN-36: the incident brief's SAFETY requirement is that the prod stage
// must require an explicit manual/UI approval (a GitHub Environment with
// required reviewers) and must NEVER auto-deploy on merge. This is a
// committed guard so a future edit to deploy-backend-prod.yml can't
// silently drop the `environment: prod` gate or the `needs: verify-nonprod`
// staging, re-introducing an unattended prod deploy.
//
// Text/regex assertions (not a real YAML parse) to match the house style
// used by kan31-user-data-invokes-provision-backend.test.js and to avoid
// depending on js-yaml, which isn't a declared dependency of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'deploy-backend-prod.yml'
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

// Isolate the `deploy-prod:` job block: from its `deploy-prod:` header up to
// (but not including) the next top-level (2-space-indented) job key, or EOF.
function extractDeployProdJob(workflow) {
  const match = workflow.match(/^ {2}deploy-prod:\n([\s\S]*?)(?=^ {2}\S.*:\n|(?![\s\S]))/m);
  assert.ok(match, 'deploy-backend-prod.yml must define a top-level `deploy-prod:` job');
  return match[1];
}

test('deploy-backend-nonprod.yml (the dead, never-triggered develop-branch workflow) no longer exists', () => {
  const deadWorkflowPath = path.join(
    __dirname,
    '..',
    '..',
    '.github',
    'workflows',
    'deploy-backend-nonprod.yml'
  );
  assert.equal(
    fs.existsSync(deadWorkflowPath),
    false,
    'deploy-backend-nonprod.yml must be deleted -- it triggered on a branch (develop) that does not exist in this repo and duplicated deploy-backend-prod.yml\'s verify-nonprod job'
  );
});

test('the deploy-prod job in deploy-backend-prod.yml is gated behind the protected `prod` GitHub Environment', () => {
  const job = extractDeployProdJob(readWorkflow());
  assert.match(
    job,
    /^ {4}environment: prod\s*$/m,
    'deploy-prod job must declare `environment: prod` so GitHub Environment protection (required reviewers) gates it'
  );
});

test('the deploy-prod job in deploy-backend-prod.yml only runs after verify-nonprod succeeds', () => {
  const job = extractDeployProdJob(readWorkflow());
  assert.match(
    job,
    /^ {4}needs: verify-nonprod\s*$/m,
    'deploy-prod job must declare `needs: verify-nonprod` so prod is staged strictly behind a green nonprod deploy'
  );
});

test('deploy-backend-prod.yml does not trigger the prod job on push without the nonprod gate (no separate auto-deploy-to-prod job)', () => {
  const workflow = readWorkflow();
  const jobsSection = workflow.slice(workflow.search(/^jobs:\s*$/m));
  const jobNames = [...jobsSection.matchAll(/^ {2}([\w-]+):\n/gm)].map((m) => m[1]);
  assert.deepEqual(
    jobNames,
    ['verify-nonprod', 'deploy-prod'],
    'deploy-backend-prod.yml must define exactly the staged verify-nonprod -> deploy-prod job pair, nothing that bypasses the gate'
  );
});
