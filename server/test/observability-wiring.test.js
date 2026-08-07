'use strict';

// Wiring tests for the log-shipping path:
//
//   backend stdout -> /var/log/crypto-tracker/backend.log -> CloudWatch agent
//   -> /crypto-tracker/<env>/backend -> Logs Insights
//
// Every link here is configuration spread across a systemd unit, a shell script,
// Terraform and a metadata file. None of it is exercised by running the app, and
// all of it fails SILENTLY: a wrong path means the agent tails a file nobody
// writes, a missing IAM action means PutLogEvents is denied on a box you are not
// watching, and a logrotate mode mismatch means the log stops growing after the
// first rotation. In every case the app keeps serving perfectly and the logs
// simply stop arriving.
//
// The specific regression that motivated these: an earlier version left the
// backend logging to journald while the agent was configured to tail only the
// nginx files — so backend logs never left the instance at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

const UNIT = read('infra', 'systemd', 'crypto-tracker-backend.service');
const PROVISION = read('infra', 'scripts', 'provision-backend.sh');
const TERRAFORM = read('infra', 'observability.tf');
const CONNECTORS = JSON.parse(read('observability', 'connectors.json'));

const BACKEND_LOG = '/var/log/crypto-tracker/backend.log';
const ENVIRONMENTS = ['nonprod', 'prod'];

// --- The link that was broken before -------------------------------------

test('systemd writes the backend to a FILE, not the journal — the agent cannot read journald', () => {
  assert.match(UNIT, new RegExp(`StandardOutput=append:${BACKEND_LOG}`));
});

test('stderr goes to the journal so backend.log stays 100% valid JSON', () => {
  // Caught on the first real deploy: with StandardError also appended to
  // backend.log, Node runtime text (deprecations, the AWS SDK v3
  // NodeVersionSupportWarning) landed in the file — 19 of 33 lines were
  // unparseable. Those lines are still captured in the journal; they are just
  // not mixed into the structured stream CloudWatch ingests.
  assert.match(UNIT, /StandardError=journal/);
  assert.ok(!new RegExp(`StandardError=append:${BACKEND_LOG}`).test(UNIT),
    'stderr must not be merged into the JSON log file');
});

test('the log directory is created BEFORE the unit is rendered — 209/STDOUT regression', () => {
  // Caught in a real nonprod deploy: the unit originally relied on systemd's
  // LogsDirectory= to create /var/log/crypto-tracker, but systemd sets standard
  // output up BEFORE creating that directory. The service failed at spawn with
  //   Failed to set up standard output: No such file or directory
  //   Main process exited, code=exited, status=209/STDOUT
  // and restart-looped. Worse, deploy-backend-ec2.sh's rollback re-points the
  // release symlink but does NOT restore the previous unit, so the rolled-back
  // release could not start either and the environment went down.
  assert.match(PROVISION, /mkdir -p \/var\/log\/crypto-tracker/);


  // LogsDirectory= must NOT come back as a DIRECTIVE: it reads as if it solves
  // this and does not. Comments may still explain why (and do), so only
  // non-comment lines are checked.
  const unitDirectives = UNIT.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  assert.ok(!/LogsDirectory=/.test(unitDirectives),
    'LogsDirectory= does not run early enough for StandardOutput=append:');

  // Ordering is the whole point — the directory must exist before the unit that
  // depends on it is written and started.
  const mkdirAt = PROVISION.indexOf('mkdir -p /var/log/crypto-tracker');
  const renderAt = PROVISION.indexOf('Rendering systemd unit');
  assert.ok(mkdirAt > -1 && renderAt > -1 && mkdirAt < renderAt,
    'the log directory must be created before the systemd unit is rendered');
});

test('the CloudWatch agent tails exactly the file systemd writes', () => {
  assert.match(PROVISION, new RegExp(`BACKEND_LOG=${BACKEND_LOG}`));
  assert.match(PROVISION, /"file_path": "\$BACKEND_LOG"/);
  assert.match(PROVISION, /"log_group_name": "\$CW_LOG_GROUP_BACKEND"/);
});

// --- Per-environment isolation -------------------------------------------

test('the log group is derived from $ENVIRONMENT, so the two environments cannot share one', () => {
  assert.match(PROVISION, /CW_LOG_GROUP_BACKEND="\/crypto-tracker\/\$ENVIRONMENT\/backend"/);
  assert.match(PROVISION, /CW_LOG_GROUP_NGINX="\/crypto-tracker\/\$ENVIRONMENT\/nginx"/);
});

test('Terraform creates one log group per environment with bounded retention', () => {
  assert.match(TERRAFORM, /resource "aws_cloudwatch_log_group" "backend"[\s\S]{0,400}for_each = toset\(var\.environments\)/);
  assert.match(TERRAFORM, /name\s+=\s+"\/\$\{var\.project_name\}\/\$\{each\.key\}\/backend"/);

  // Never-expire is the CloudWatch default and the usual cause of a surprise
  // bill on a log group everyone believed was free.
  assert.match(TERRAFORM, /retention_in_days = local\.log_retention_days\[each\.key\]/);
  assert.match(TERRAFORM, /nonprod = 14/);
  assert.match(TERRAFORM, /prod\s+= 30/);
});

test('IAM is least privilege and scoped per environment — nonprod cannot write prod logs', () => {
  assert.match(TERRAFORM, /for_each = toset\(var\.environments\)/);

  // Scoped to THIS environment's group ARNs. The ":*" suffix matters: these
  // actions operate on streams inside the group, not on the group itself.
  assert.match(TERRAFORM, /\$\{aws_cloudwatch_log_group\.backend\[each\.key\]\.arn\}:\*/);
  assert.match(TERRAFORM, /\$\{aws_cloudwatch_log_group\.nginx\[each\.key\]\.arn\}:\*/);

  // Exactly three actions, all write-path. Anything broader is a finding.
  for (const action of ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams']) {
    assert.ok(TERRAFORM.includes(action), `expected ${action}`);
  }

  // CreateLogGroup is deliberately withheld: Terraform owns the groups, so a
  // typo fails loudly instead of silently creating an unmanaged, never-expiring
  // group that bills forever.
  assert.ok(!TERRAFORM.includes('logs:CreateLogGroup'), 'the instance must not be able to create log groups');

  // No wildcard resource on the log write path.
  assert.ok(!/resources = \["\*"\]/.test(TERRAFORM), 'no wildcard resource in the observability policy');
});

// --- Bounded disk ---------------------------------------------------------

test('logrotate uses copytruncate — required by StandardOutput=append:', () => {
  assert.match(PROVISION, /\/etc\/logrotate\.d\/crypto-tracker/);
  assert.match(PROVISION, /\/var\/log\/crypto-tracker\/backend\.log \{/);

  // systemd holds an open fd for the life of the process. logrotate's default
  // rename-and-create would leave the backend writing into the renamed inode
  // forever: the new file stays empty and the agent ships nothing until the
  // service restarts. copytruncate keeps the existing descriptor valid.
  assert.match(PROVISION, /copytruncate/);
  assert.match(PROVISION, /rotate 5/);
  assert.match(PROVISION, /size 50M/);

  // systemd creates backend.log as root:root 0644 — it opens stdio before
  // dropping to User=ubuntu. `su ubuntu ubuntu` made logrotate act as ubuntu,
  // which cannot truncate a root-owned file, so rotation silently failed and the
  // log would have grown until it filled the disk. Rotation running as root
  // against a root-owned file is the only combination that works.
  assert.ok(!/^\s*su\s+/m.test(PROVISION), 'logrotate must run as root, not su to another user');
  assert.match(PROVISION, /chown root:root \/var\/log\/crypto-tracker/);
  assert.ok(!/chown ubuntu:ubuntu \/var\/log\/crypto-tracker/.test(PROVISION),
    'the log directory must stay root-owned so logrotate can truncate');
});

// --- Failure must not take the service down ------------------------------

test('a failed agent install or config reload warns but never aborts the deploy', () => {
  const failurePaths = PROVISION.match(/WARNING: (CloudWatch agent|could not download)[^\n]*/g) || [];
  assert.ok(failurePaths.length >= 3, 'install, download and config-reload failures must each degrade to a warning');

  // `set -euo pipefail` is in force, so every failure path must be neutralised
  // with `|| echo ...` rather than being allowed to abort the script.
  for (const line of failurePaths) {
    assert.ok(/logs remain on disk/.test(line), `failure path should state the fallback: ${line}`);
  }

  // Anchored to the agent section specifically. Slicing from the first mention
  // of "CloudWatch agent" would catch the unrelated systemd-template guard
  // earlier in the file, which SHOULD exit non-zero — a missing unit template
  // is a broken deploy, whereas a missing log shipper is not.
  const agentSection = PROVISION.slice(PROVISION.indexOf('# --- CloudWatch agent ---'));
  assert.ok(agentSection.length > 0, 'expected a marked CloudWatch agent section');
  assert.ok(!/exit [1-9]/.test(agentSection), 'agent failures must not exit non-zero');
});

// --- No credentials anywhere in this path --------------------------------

test('the observability path introduces no token, key or secret', () => {
  const combined = `${UNIT}\n${PROVISION}\n${TERRAFORM}\n${JSON.stringify(CONNECTORS)}`;

  assert.ok(!/OBSERVABILITY_SECRET_NAME/.test(combined), 'no observability secret should exist');
  assert.ok(!/OTEL_EXPORTER_OTLP_HEADERS/.test(combined), 'no OTLP ingest header should exist');
  assert.doesNotMatch(combined, /\beyJ[A-Za-z0-9_-]{10,}\./, 'no JWT');
  assert.doesNotMatch(combined, /\bAKIA[0-9A-Z]{16}\b/, 'no AWS access key');

  // Authentication is the instance role, and the registry says so explicitly.
  for (const environment of ENVIRONMENTS) {
    const cw = CONNECTORS.environments[environment].destinations.find((d) => d.id === 'cloudwatch_logs');
    assert.equal(cw.authentication.method, 'ec2-instance-role');
    assert.equal(cw.authentication.credentials_stored, false);
  }
});

// --- The metadata must describe reality ----------------------------------

test('connectors.json log groups match what Terraform creates and the agent writes to', () => {
  for (const environment of ENVIRONMENTS) {
    const cw = CONNECTORS.environments[environment].destinations.find((d) => d.id === 'cloudwatch_logs');

    assert.ok(cw, `${environment} must declare a cloudwatch_logs destination`);
    assert.equal(cw.enabled, true);
    assert.equal(cw.provider, 'aws');
    assert.equal(cw.signal, 'logs');
    assert.equal(cw.log_group, `/crypto-tracker/${environment}/backend`);
  }

  // Retention in the metadata must match the Terraform locals, or the published
  // cost story is wrong.
  assert.equal(CONNECTORS.environments.nonprod.destinations[0].retention_days, 14);
  assert.equal(CONNECTORS.environments.prod.destinations[0].retention_days, 30);
});

test('connectors.json is metadata only — nothing reads it at runtime or deploy time', () => {
  assert.equal(CONNECTORS.pipeline.application_knows_about_cloudwatch, false);

  // The guarantee that makes this file safe to edit: a documentation change must
  // not be able to break a deploy. Comments may REFER to the registry (and do,
  // to explain why it is not consulted); only executable lines are checked.
  const executableLines = (script) =>
    script
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');

  assert.ok(
    !executableLines(read('deploy-backend-ec2.sh')).includes('connectors.json'),
    'the deploy script must not read or parse connectors.json'
  );
  assert.ok(
    !executableLines(PROVISION).includes('connectors.json'),
    'the provisioning script must not read or parse connectors.json'
  );
});

test('connectors.json declares the log fields Logs Insights queries depend on', () => {
  const fields = [...CONNECTORS.log_record_fields.always, ...CONNECTORS.log_record_fields.per_request];

  // These four are what replace a metrics system: rate, errors and p99 all
  // derive from them.
  for (const required of ['http.status_code', 'duration_ms', 'http.route', 'http.method']) {
    assert.ok(fields.includes(required), `Logs Insights needs "${required}"`);
  }
  for (const required of ['release_id', 'deployment.environment', 'request_id']) {
    assert.ok(fields.includes(required), `expected "${required}" on every record`);
  }
});

test('connectors.json marks unimplemented capabilities as NOT implemented', () => {
  // So nobody — human or agent — builds against something that does not exist.
  const notImplemented = CONNECTORS.not_implemented;

  for (const capability of ['metrics', 'traces', 'dashboards', 'alarms', 'slos', 'frontend']) {
    assert.ok(typeof notImplemented[capability] === 'string', `${capability} must be declared not-implemented`);
  }

  assert.match(notImplemented.traces, /NO spans are exported/i);
  assert.match(notImplemented.metrics, /no CloudWatch custom metrics/i);
});

// --- The app stays vendor-neutral ----------------------------------------

test('application code contains no CloudWatch-specific logic', () => {
  const observabilityDir = path.join(REPO_ROOT, 'server', 'src', 'observability');
  const sources = fs
    .readdirSync(observabilityDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(observabilityDir, f), 'utf8'));

  for (const source of sources) {
    // Comments may explain the destination; code must not reference an SDK,
    // a log group, or an AWS API. That is what keeps the shipper swappable.
    const code = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/CloudWatchLogs|PutLogEvents|log_group|@aws-sdk\/client-cloudwatch/i.test(code),
      'the app must write JSON to stdout and know nothing about where it is shipped');
  }
});
