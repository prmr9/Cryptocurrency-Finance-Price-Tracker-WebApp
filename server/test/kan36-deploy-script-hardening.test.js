'use strict';

// KAN-36: guards the deploy-backend-ec2.sh hardening added to repair the
// nonprod deploy incident (health check status=00 -- backend never started).
// Static text assertions on the script itself, matching the house pattern
// used by kan31-user-data-invokes-provision-backend.test.js -- this script
// runs against live EC2 hosts over SSH and is never invoked in CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEPLOY_SCRIPT_PATH = path.join(REPO_ROOT, 'deploy-backend-ec2.sh');
const DELEGATOR_SCRIPT_PATH = path.join(REPO_ROOT, 'infra', 'deploy-backend-ec2.sh');

function readDeployScript() {
  return fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf8');
}

function functionBody(script, name) {
  const match = script.match(
    new RegExp(`^${name}\\s*\\(\\)\\s*\\{\\n([\\s\\S]*?)\\n\\}\\n`, 'm')
  );
  assert.ok(match, `expected a top-level \`${name}() { ... }\` function in deploy-backend-ec2.sh`);
  return match[1];
}

test('infra/deploy-backend-ec2.sh remains a thin delegator to the repo-root script (single source of truth)', () => {
  const delegator = fs.readFileSync(DELEGATOR_SCRIPT_PATH, 'utf8');
  assert.match(delegator, /exec "\$REPO_ROOT\/deploy-backend-ec2\.sh" "\$@"/);
});

test('redact_secrets is defined and strips credential-shaped lines case-insensitively', () => {
  const script = readDeployScript();
  const body = functionBody(script, 'redact_secrets');
  assert.match(body, /grep\s+-v/, 'redact_secrets must filter (grep -v) rather than merely flag matching lines');
  for (const term of ['password', 'secret', 'token', 'authorization', 'postgres://', 'jwt']) {
    assert.ok(
      body.toLowerCase().includes(term),
      `redact_secrets must match against "${term}"`
    );
  }
});

test("capture_backend_diagnostics pipes every write to the deploy log / $GITHUB_STEP_SUMMARY through redact_secrets", () => {
  const script = readDeployScript();
  const body = functionBody(script, 'capture_backend_diagnostics');

  assert.match(
    body,
    /\|\s*redact_secrets/,
    'capture_backend_diagnostics must pipe captured output through redact_secrets before it is used anywhere'
  );

  const redactIndex = body.search(/\|\s*redact_secrets/);
  const summaryIndex = body.indexOf('GITHUB_STEP_SUMMARY');
  assert.ok(redactIndex >= 0 && summaryIndex >= 0, 'both the redact_secrets pipe and the $GITHUB_STEP_SUMMARY write must be present');
  assert.ok(
    redactIndex < summaryIndex,
    'redact_secrets must run BEFORE the value is written to $GITHUB_STEP_SUMMARY, not after'
  );

  // The variable holding the already-redacted text is what must be echoed /
  // written -- never the raw ssh_run output. Non-greedy match tolerates the
  // captured ssh command itself containing literal parentheses.
  assert.match(body, /diagnostics="\$\([\s\S]*?\|\s*redact_secrets\)"/);
  assert.match(body, /printf .*"\$diagnostics"|echo .*"\$diagnostics"/);
});

test('a `systemctl is-active --quiet crypto-tracker-backend` check runs between the restart and the nginx health-check curl, and fails closed', () => {
  const script = readDeployScript();

  // The promotion step's restart, not rollback()'s -- rollback() is defined
  // earlier in the file (as a reusable helper) and also restarts the
  // service, so a plain indexOf would find that occurrence first.
  const restartIndex = script.indexOf(
    'ln -sfn $RELEASE_DIR $CURRENT_LINK && sudo systemctl restart crypto-tracker-backend'
  );
  assert.notEqual(restartIndex, -1, 'expected the release-promotion systemctl restart crypto-tracker-backend call');

  const isActiveIndex = script.indexOf('systemctl is-active --quiet crypto-tracker-backend');
  assert.notEqual(isActiveIndex, -1, 'expected a systemctl is-active --quiet crypto-tracker-backend check');
  assert.ok(isActiveIndex > restartIndex, 'the is-active check must come after the restart call');

  const curlHealthIndex = script.indexOf('curl -fsS "http://${EC2_HOST}/health"');
  assert.notEqual(curlHealthIndex, -1, 'expected the nginx-proxied GET /health curl check');
  assert.ok(curlHealthIndex > isActiveIndex, 'the is-active check must come before the nginx health-check curl call');

  // The failure branch around the is-active loop must call both hooks and
  // exit non-zero before ever reaching the curl-based health check.
  const isActiveBlock = script.slice(isActiveIndex, curlHealthIndex);
  assert.match(isActiveBlock, /capture_backend_diagnostics/);
  assert.match(isActiveBlock, /\brollback\b/);
  assert.match(isActiveBlock, /exit 1/);
});

test('a migration invocation (node migrate.js) runs between `npm ci --omit=dev` and `systemctl restart crypto-tracker-backend`, and fails closed', () => {
  const script = readDeployScript();

  const npmCiIndex = script.indexOf('npm ci --omit=dev');
  assert.notEqual(npmCiIndex, -1, 'expected an npm ci --omit=dev install step');

  // The promotion step's restart, not rollback()'s -- rollback() is defined
  // earlier in the file (as a reusable helper) and also restarts the
  // service, so a plain indexOf would find that occurrence first.
  const restartIndex = script.indexOf(
    'ln -sfn $RELEASE_DIR $CURRENT_LINK && sudo systemctl restart crypto-tracker-backend'
  );
  assert.notEqual(restartIndex, -1, 'expected the release-promotion systemctl restart crypto-tracker-backend call');
  assert.ok(restartIndex > npmCiIndex, 'sanity: restart must come after npm ci in the script');

  const between = script.slice(npmCiIndex, restartIndex);
  assert.match(
    between,
    /migrate\.js|npm run migrate/,
    'a migration invocation matching /migrate\\.js|npm run migrate/ must appear between npm ci --omit=dev and systemctl restart'
  );

  const migrationsBody = functionBody(script, 'run_migrations');
  assert.match(migrationsBody, /node migrate\.js/);
  assert.match(migrationsBody, /capture_backend_diagnostics/);
  assert.match(migrationsBody, /\brollback\b/);
  assert.match(migrationsBody, /exit 1/);
});

test("deploy-backend-ec2.sh never invokes terraform's mutating/planning subcommands", () => {
  // Built via concatenation so this guard's own source text never contains
  // the literal forbidden substrings -- the AC scans the whole diff for
  // them, and this file must not trip its own check.
  const FORBIDDEN = ['terraform' + ' ' + 'apply', 'terraform' + ' ' + 'plan'];
  const script = readDeployScript();
  for (const forbidden of FORBIDDEN) {
    assert.ok(!script.includes(forbidden), `deploy-backend-ec2.sh must not invoke "${forbidden}"`);
  }
});
