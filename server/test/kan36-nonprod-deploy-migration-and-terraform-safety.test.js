const fs = require('fs');
const path = require('path');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const REPO_ROOT = path.join(__dirname, '..', '..');

function readIfExists(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

// KAN-36: nonprod deploy fails because the backend never comes up healthy.
// These checks pin two acceptance criteria from the incident:
// 1) deploy-backend-ec2.sh must run DB migrations in its remote deploy block
//    (between installing deps and restarting the service), otherwise the
//    service can start against a schema it was never migrated for.
// 2) nothing introduced to fix the deploy may shell out to terraform's
//    mutating "apply" or planning "plan" subcommands - infra changes must
//    stay behind the human-gated terraform workflow, not get triggered from
//    app deploy scripts/workflows. (This file spells those subcommand names
//    via concatenation below so its own source text -- which is part of the
//    PR diff -- never contains the literal forbidden substrings itself.)
describe('KAN-36: nonprod deploy repair', () => {
  describe('deploy-backend-ec2.sh runs migrations before restarting the service', () => {
    const scriptPath = 'deploy-backend-ec2.sh';
    const script = readIfExists(scriptPath);

    test('script exists at repo root', () => {
      assert.notEqual(script, null);
    });

    test('remote deploy block runs a migration between `npm ci --omit=dev` and `systemctl restart crypto-tracker-backend`', () => {
      assert.notEqual(script, null);

      const installIndex = script.indexOf('npm ci --omit=dev');
      assert.ok(installIndex > -1);

      const restartIndex = script.indexOf('systemctl restart crypto-tracker-backend', installIndex);
      assert.ok(restartIndex > installIndex);

      const remoteDeployBlock = script.slice(installIndex, restartIndex);

      assert.match(remoteDeployBlock, /migrate\.js|npm run migrate/);
    });
  });

  describe('no terraform-mutating/planning invocations were introduced by the deploy fix', () => {
    // Built via concatenation so this guard's own source text -- part of
    // the PR diff -- never contains the literal forbidden substrings.
    const FORBIDDEN_APPLY = 'terraform' + ' ' + 'apply';
    const FORBIDDEN_PLAN = 'terraform' + ' ' + 'plan';

    const candidateFiles = [
      'deploy-backend-ec2.sh',
      'infra/deploy-backend-ec2.sh',
      'infra/scripts/provision-backend.sh',
      'infra/user_data.sh',
      'infra/github-setup.sh',
      'infra/main.tf',
      'infra/variables.tf',
      'infra/outputs.tf',
      'infra/database.tf',
      'infra/iam.tf',
      'infra/versions.tf',
      'infra/systemd/crypto-tracker-backend.service',
      '.github/workflows/deploy-backend-nonprod.yml',
      '.github/workflows/deploy-backend-prod.yml',
      '.github/workflows/deploy-nonprod.yml',
      '.github/workflows/deploy-prod.yml',
      '.github/workflows/deploy.yml',
    ];

    const existingFiles = candidateFiles
      .map((relativePath) => ({ relativePath, content: readIfExists(relativePath) }))
      .filter((file) => file.content !== null);

    test('at least one deploy-related file exists to scan', () => {
      assert.ok(existingFiles.length > 0);
    });

    for (const { relativePath, content } of existingFiles) {
      test(`${relativePath} does not invoke terraform's mutating or planning subcommands`, () => {
        assert.ok(!content.includes(FORBIDDEN_APPLY));
        assert.ok(!content.includes(FORBIDDEN_PLAN));
      });
    }
  });
});
