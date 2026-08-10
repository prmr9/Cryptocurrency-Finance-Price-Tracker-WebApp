'use strict';

// KAN-60: the pre-merge CI gate (.github/workflows/devagent-ci.yml) had drifted
// STRICTLY WEAKER than DevAgent's build gate — the check that actually blocks
// merges — so faults slipped through pre-merge and only surfaced post-merge as
// "CI failed after merge" (KAN-57). This test pins the workflow at parity so an
// innocent-looking edit cannot quietly re-open the gap:
//
//   1. a Docker-free `node-server` job that runs the full server suite
//      (`npm ci` + `npm test`) scoped to server/;
//   2. a STRICT frontend build (`CI=true`) so eslint warnings fail the build
//      exactly as the merge gate does — never the lenient `npm run build`;
//   3. triggers scoped to pull_request + push:[main] (no unfiltered all-branches
//      push), plus a concurrency block that cancels superseded PR runs but lets
//      a post-merge main run finish;
//   4. NO runtime diff logic (`git diff` / `github.event.before`) and no
//      job-level `if:` that skips a job on a changed-file flag.
//
// Runner: node:test, matching the other server/test/*.test.js files (run via
// `node --test`). Built-ins only (node:test, node:assert, fs, path) — no new npm
// dependency, no package.json/package-lock.json change.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const CI_WF_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'devagent-ci.yml');
const wf = fs.readFileSync(CI_WF_PATH, 'utf8');

// The `jobs:` map only, so job-key assertions do not match the top-level blocks.
const jobsBlock = (() => {
  const idx = wf.indexOf('\njobs:');
  return idx === -1 ? '' : wf.slice(idx);
})();

test('a Docker-free node-server job runs `npm ci` and `npm test` scoped to the server directory', () => {
  assert.match(jobsBlock, /^\s{2}node-server:/m, 'a node-server job must exist under jobs:');

  const nsStart = jobsBlock.search(/^\s{2}node-server:/m);
  const rest = jobsBlock.slice(nsStart + 1);
  const nextJob = rest.search(/^\s{2}\S/m);
  const nodeServer = nextJob === -1 ? jobsBlock.slice(nsStart) : jobsBlock.slice(nsStart, nsStart + 1 + nextJob);

  assert.match(
    nodeServer,
    /working-directory:\s*server\b/,
    'node-server must be scoped to the server directory (defaults.run.working-directory: server)'
  );
  assert.match(nodeServer, /run:\s*npm ci\b/, 'node-server must run `npm ci`');
  assert.match(nodeServer, /run:\s*npm test\b/, 'node-server must run `npm test`');
  assert.doesNotMatch(nodeServer, /^\s*services:/m, 'node-server must not declare a services:/Docker container');
  assert.match(nodeServer, /node-version:\s*22\b/, 'node-server setup-node must use node-version: 22');
  assert.match(
    nodeServer,
    /cache-dependency-path:\s*server\/package-lock\.json/,
    'node-server setup-node must cache on server/package-lock.json'
  );
});

test('the node-root frontend build runs strictly with CI=true, never the lenient build script', () => {
  assert.match(
    wf,
    /CI=true\s+npx\s+react-scripts\s+build/,
    'the frontend build step must run with CI=true so eslint warnings fail the build'
  );
  assert.doesNotMatch(wf, /npm run build/, 'the workflow must not invoke the lenient `npm run build` script');
  assert.doesNotMatch(wf, /CI=false/, 'the workflow must not set CI=false anywhere');
});

test('triggers are scoped to pull_request + push:[main], with no unfiltered all-branches push', () => {
  const onStart = wf.search(/^on:/m);
  const onEnd = wf.slice(onStart).search(/^(concurrency|jobs):/m);
  const onBlock = wf.slice(onStart, onStart + onEnd);

  assert.match(onBlock, /pull_request:/, 'on: must declare pull_request');
  assert.match(onBlock, /push:\s*\n\s+branches:\s*\[\s*main\s*\]/, 'push: must be restricted to branches: [main]');
  assert.doesNotMatch(
    onBlock,
    /push:\s*\n(?!\s+branches:)/,
    'push: must not be an unfiltered all-branches trigger — it must carry branches: [main]'
  );
});

test('a top-level concurrency block cancels superseded PR runs but not post-merge main runs', () => {
  const conc = wf.match(/^concurrency:[\s\S]*?(?=^jobs:)/m);
  assert.ok(conc, 'a top-level concurrency: block must exist');
  const block = conc[0];
  assert.match(block, /group:\s*.*\$\{\{\s*github\.ref\s*\}\}/, 'concurrency.group must include ${{ github.ref }}');
  assert.match(block, /cancel-in-progress:/, 'concurrency must set a cancel-in-progress key');
});

test('the change is config-only: no runtime diff logic and no changed-file job skipping', () => {
  assert.doesNotMatch(wf, /git diff/, 'the workflow must contain no `git diff` detect-changes logic');
  assert.doesNotMatch(wf, /github\.event\.before/, 'the workflow must not reference github.event.before');
});

test('the build comment states the CI step sets CI=true explicitly (and no longer claims the build script does)', () => {
  assert.match(
    wf,
    /#[^\n]*CI=true[^\n]*explicitly/i,
    'the build comment must state that the CI build step sets CI=true explicitly'
  );
});
