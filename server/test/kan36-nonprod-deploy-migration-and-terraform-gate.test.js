const fs = require('fs');
const path = require('path');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEPLOY_SCRIPT_PATH = path.join(REPO_ROOT, 'deploy-backend-ec2.sh');

// Built by concatenation so this test file itself never contains the literal
// substrings it is asserting against (would otherwise trip its own check).
const TERRAFORM_APPLY = ['terraform', 'apply'].join(' ');
const TERRAFORM_PLAN = ['terraform', 'plan'].join(' ');

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function deployAutomationFiles() {
  const candidates = [
    DEPLOY_SCRIPT_PATH,
    path.join(REPO_ROOT, 'infra', 'deploy-backend-ec2.sh'),
    path.join(REPO_ROOT, 'infra', 'user_data.sh'),
  ].filter((p) => fs.existsSync(p));

  const workflowsDir = path.join(REPO_ROOT, '.github', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    candidates.push(...collectFiles(workflowsDir));
  }

  const scriptsDir = path.join(REPO_ROOT, 'infra', 'scripts');
  if (fs.existsSync(scriptsDir)) {
    candidates.push(...collectFiles(scriptsDir));
  }

  return [...new Set(candidates)];
}

describe('KAN-36: nonprod backend deploy repair', () => {
  test('deploy-backend-ec2.sh runs the DB migration between "npm ci --omit=dev" and the systemd restart', () => {
    assert.equal(fs.existsSync(DEPLOY_SCRIPT_PATH), true);
    const content = fs.readFileSync(DEPLOY_SCRIPT_PATH, 'utf8');

    const npmCiIndex = content.indexOf('npm ci --omit=dev');
    const restartIndex = content.indexOf('systemctl restart crypto-tracker-backend');

    assert.ok(npmCiIndex > -1);
    assert.ok(restartIndex > npmCiIndex);

    // The service must never restart against an un-migrated schema, which is
    // what produced the /auth/login status=00 (backend crash-looping) on nonprod.
    const remoteDeployRegion = content.slice(npmCiIndex, restartIndex);
    assert.match(remoteDeployRegion, /migrate\.js|npm run migrate/);
  });

  test('deploy automation never shells out to terraform apply/plan directly, keeping prod behind the human-approved gate', () => {
    const files = deployAutomationFiles();
    assert.ok(files.length > 0);

    const offenders = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(TERRAFORM_APPLY) || content.includes(TERRAFORM_PLAN)) {
        offenders.push(file);
      }
    }

    assert.deepEqual(offenders, []);
  });
});
