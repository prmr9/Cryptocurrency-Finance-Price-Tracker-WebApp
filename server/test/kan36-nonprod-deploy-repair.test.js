const fs = require('fs');
const path = require('path');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readIfExists(relPath) {
  const fullPath = path.join(REPO_ROOT, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
}

function listWorkflowFiles() {
  const dir = path.join(REPO_ROOT, '.github', 'workflows');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join('.github', 'workflows', name));
}

describe('KAN-36: nonprod deploy repair', () => {
  test("remote deploy block runs migrations between 'npm ci --omit=dev' and 'systemctl restart crypto-tracker-backend'", () => {
    const candidatePaths = ['deploy-backend-ec2.sh', 'infra/deploy-backend-ec2.sh'];
    const scripts = candidatePaths
      .map((relPath) => ({ relPath, content: readIfExists(relPath) }))
      .filter(({ content }) => content !== null);

    assert.ok(scripts.length > 0);

    const remoteDeployScripts = scripts.filter(
      ({ content }) =>
        content.includes('npm ci --omit=dev') &&
        content.includes('systemctl restart crypto-tracker-backend')
    );

    assert.ok(remoteDeployScripts.length > 0);

    for (const { relPath, content } of remoteDeployScripts) {
      const npmCiIndex = content.indexOf('npm ci --omit=dev');
      const restartIndex = content.indexOf(
        'systemctl restart crypto-tracker-backend',
        npmCiIndex
      );

      assert.ok(restartIndex > npmCiIndex);

      const region = content.slice(npmCiIndex, restartIndex);

      assert.match(region, /migrate\.js|npm run migrate/);
    }
  });

  test('deploy scripts and CI workflows never invoke terraform apply/plan directly', () => {
    const candidatePaths = [
      'deploy-backend-ec2.sh',
      'infra/deploy-backend-ec2.sh',
      'infra/scripts/provision-backend.sh',
      'infra/user_data.sh',
      'infra/github-setup.sh',
      ...listWorkflowFiles(),
    ];

    const offenders = [];

    for (const relPath of candidatePaths) {
      const content = readIfExists(relPath);
      if (content === null) continue;

      if (content.includes('terraform apply') || content.includes('terraform plan')) {
        offenders.push(relPath);
      }
    }

    assert.deepEqual(offenders, []);
  });
});
