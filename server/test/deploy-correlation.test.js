'use strict';

// Contract tests for the deployment-correlation plumbing.
//
// A workflow_dispatch is answered with HTTP 204 and no body, so the caller is
// never told which run it created. Two mechanisms close that gap, and both are
// easy to break with an innocent-looking edit, so they are pinned here:
//
//   1. deploy_id flows caller -> workflow input -> run-name -> DEPLOY_ID env ->
//      deploy-backend-ec2.sh -> release.json -> GET /health.
//   2. The manifest is written AFTER the rsync (which runs --delete and would
//      otherwise remove it) and BEFORE promotion (so a release is never
//      `current` while unidentifiable).
//
// Also pinned: this script stays the SINGLE rollback authority, and the prod
// gate is not weakened.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEPLOY_SCRIPT = path.join(REPO_ROOT, 'deploy-backend-ec2.sh');
const NONPROD_WF = path.join(REPO_ROOT, '.github', 'workflows', 'deploy-backend-nonprod.yml');
const PROD_WF = path.join(REPO_ROOT, '.github', 'workflows', 'deploy-backend-prod.yml');

const read = (p) => fs.readFileSync(p, 'utf8');

for (const [label, wfPath] of [
  ['deploy-backend-nonprod.yml', NONPROD_WF],
  ['deploy-backend-prod.yml', PROD_WF],
]) {
  test(`${label} accepts a deploy_id input, stamps it into run-name, and passes it to the script`, () => {
    const wf = read(wfPath);

    assert.match(wf, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+deploy_id:/, `${label} must expose a deploy_id workflow_dispatch input`);
    assert.match(wf, /run-name:[\s\S]{0,200}inputs\.deploy_id/, `${label} must put deploy_id in run-name so a caller can find its run`);
    assert.match(wf, /DEPLOY_ID:\s*\$\{\{\s*inputs\.deploy_id\s*\}\}/, `${label} must pass deploy_id through to the deploy script as DEPLOY_ID`);
  });
}

test('deploy-backend-prod.yml passes deploy_id to BOTH the nonprod verify job and the gated prod job', () => {
  const matches = read(PROD_WF).match(/DEPLOY_ID:\s*\$\{\{\s*inputs\.deploy_id\s*\}\}/g) || [];
  assert.equal(matches.length, 2, 'both jobs must carry DEPLOY_ID or the prod release is uncorrelatable');
});

test('the prod gate is intact: verify-nonprod runs first and prod stays in the protected Environment', () => {
  const wf = read(PROD_WF);
  assert.match(wf, /needs:\s*verify-nonprod/, 'prod must remain staged behind the nonprod verify job');
  assert.match(wf, /environment:\s*prod/, 'prod must remain in the protected `prod` Environment (required reviewers)');
});

test('deploy-backend-ec2.sh rejects a deploy_id outside the documented charset', () => {
  const script = read(DEPLOY_SCRIPT);
  // The value reaches a remote shell and a JSON document, so it is validated
  // rather than escaped.
  assert.match(script, /DEPLOY_ID="\$\{DEPLOY_ID:-\}"/, 'DEPLOY_ID must be optional, defaulting to empty');
  assert.match(script, /\[A-Za-z0-9\._:-\]\{1,64\}/, 'DEPLOY_ID must be charset-validated');
  assert.match(script, /exit 2/, 'an invalid DEPLOY_ID must abort the deploy');
});

test('the release manifest is written after the rsync and before promotion', () => {
  const script = read(DEPLOY_SCRIPT);

  const rsyncServerAt = script.indexOf('"$SCRIPT_DIR/server/"');
  const manifestAt = script.indexOf('release.json');
  const promoteAt = script.indexOf('Promoting release');

  assert.ok(rsyncServerAt > -1 && manifestAt > -1 && promoteAt > -1, 'expected rsync, manifest write, and promotion steps');
  assert.ok(
    rsyncServerAt < manifestAt,
    'the manifest must be written AFTER the rsync — `rsync --delete` would otherwise remove it'
  );
  assert.ok(
    manifestAt < promoteAt,
    'the manifest must be written BEFORE promotion — a `current` release must never lack its identity'
  );
});

test('the manifest carries release_id, git_sha and deploy_id, and no secret material', () => {
  const script = read(DEPLOY_SCRIPT);
  const manifest = script.slice(script.indexOf('cat > $RELEASE_DIR/release.json'), script.indexOf('Promoting release'));

  for (const field of ['release_id', 'git_sha', 'deploy_id', 'deployed_at', 'environment']) {
    assert.match(manifest, new RegExp(`"${field}"`), `manifest must record ${field}`);
  }
  // GET /health serves this file, so nothing sensitive may be written into it.
  assert.doesNotMatch(manifest, /SECRET|PASSWORD|EC2_SSH_KEY|JWT_SECRET_NAME|DB_SECRET_NAME/i);
});

test('git_sha comes from the deployed checkout, not from whatever the host has', () => {
  const script = read(DEPLOY_SCRIPT);
  assert.match(
    script,
    /GIT_SHA="\$\(git -C "\$SCRIPT_DIR" rev-parse HEAD/,
    'git_sha must be resolved from the checkout being deployed (SCRIPT_DIR), then shipped to the host'
  );
});

test('deploy-backend-ec2.sh remains the single rollback authority and reports its outcome', () => {
  const script = read(DEPLOY_SCRIPT);

  // One rollback implementation: the symlink flip back to PREVIOUS_RELEASE.
  const rollbacks = script.match(/ln -sfn \$PREVIOUS_RELEASE \$CURRENT_LINK/g) || [];
  assert.equal(rollbacks.length, 1, 'exactly one rollback implementation must exist');

  // ...whose outcome is machine-readable, so a caller consumes it rather than
  // implementing a competing rollback of its own.
  assert.match(script, /RESULT=released/);
  assert.match(script, /RESULT=rolled_back/);
  assert.match(script, /RESULT=failed_no_rollback/);

  // Exit codes unchanged: 0 only on a passed health check, 1 on failure.
  assert.match(script, /Health check passed[\s\S]*?exit 0/);
  assert.match(script, /exit 1\s*$/);
});
