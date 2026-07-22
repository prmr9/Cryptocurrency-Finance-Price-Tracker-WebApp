'use strict';

// KAN-31 fix pass 1: the previous attempt kept infra/user_data.sh and
// infra/scripts/provision-backend.sh in sync by hand -- the Node-install and
// systemd-unit-write steps were re-typed in BOTH files. That drifted the
// first time provision-backend.sh's nginx-block logic was edited without a
// matching edit to user_data.sh, which is exactly what this acceptance
// criterion rules out ("a second, independently-written install sequence").
//
// The fix: infra/main.tf's templatefile() call for user_data now passes
// `provision_backend_script = file("${path.module}/scripts/provision-backend.sh")`
// and `backend_unit_template = file("${path.module}/systemd/crypto-tracker-backend.service")`.
// infra/user_data.sh writes those exact bytes to disk and EXECUTES the
// inlined script, so drift between the two is no longer possible by
// construction -- there is only ONE authored copy of the Node-install /
// systemd-unit-write / nginx-proxy logic (infra/scripts/provision-backend.sh),
// not two.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const MAIN_TF_PATH = path.join(REPO_ROOT, 'infra', 'main.tf');
const USER_DATA_PATH = path.join(REPO_ROOT, 'infra', 'user_data.sh');
const PROVISION_PATH = path.join(REPO_ROOT, 'infra', 'scripts', 'provision-backend.sh');
const UNIT_TEMPLATE_PATH = path.join(REPO_ROOT, 'infra', 'systemd', 'crypto-tracker-backend.service');

test('infra/main.tf inlines infra/scripts/provision-backend.sh and the systemd unit byte-for-byte into the user_data template', () => {
  const mainTf = fs.readFileSync(MAIN_TF_PATH, 'utf8');

  assert.match(
    mainTf,
    /provision_backend_script\s*=\s*file\(\s*"\$\{path\.module\}\/scripts\/provision-backend\.sh"\s*\)/,
    'main.tf must file()-read infra/scripts/provision-backend.sh into the user_data templatefile() call'
  );
  assert.match(
    mainTf,
    /backend_unit_template\s*=\s*file\(\s*"\$\{path\.module\}\/systemd\/crypto-tracker-backend\.service"\s*\)/,
    'main.tf must file()-read infra/systemd/crypto-tracker-backend.service into the user_data templatefile() call'
  );
});

test('infra/user_data.sh embeds the inlined provision-backend.sh and actually EXECUTES it (invokes it, rather than re-implementing install steps)', () => {
  const userData = fs.readFileSync(USER_DATA_PATH, 'utf8');

  // The Terraform tokens that receive the exact bytes of the shared script
  // and unit template -- these are substituted at `terraform apply` time,
  // never hand-copied.
  assert.match(userData, /\$\{provision_backend_script\}/);
  assert.match(userData, /\$\{backend_unit_template\}/);

  // It must be written to disk AND actually run, not merely staged.
  assert.match(userData, /chmod \+x \/opt\/provision-backend\.sh/);
  assert.match(userData, /^\/opt\/provision-backend\.sh\s*$/m);

  // No independently-written Node-install sequence should exist OUTSIDE the
  // inlined ${provision_backend_script} token -- these strings must appear
  // ONLY via the embedded token, never hand-typed a second time in this file.
  const outsideInlinedToken = userData.replace(/\$\{provision_backend_script\}/g, '');
  assert.ok(
    !/nodesource\.com\/setup_/i.test(outsideInlinedToken),
    'user_data.sh must not contain its own hand-written NodeSource install line outside the inlined provision-backend.sh'
  );
  assert.ok(
    !/location \/auth\//.test(outsideInlinedToken),
    'user_data.sh must not hand-write its own nginx backend proxy locations outside the inlined provision-backend.sh'
  );
});

test('infra/scripts/provision-backend.sh remains the single source of truth: installs Node, writes the systemd unit, and configures the nginx proxy', () => {
  const provision = fs.readFileSync(PROVISION_PATH, 'utf8');

  assert.match(provision, /nodesource\.com\/setup_/i);
  assert.match(provision, /systemctl (daemon-reload|enable)/);
  assert.match(provision, /location \/auth\//);
});

test('infra/systemd/crypto-tracker-backend.service sets the required restart/limit directives', () => {
  const unit = fs.readFileSync(UNIT_TEMPLATE_PATH, 'utf8');

  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /RestartSec=5/);
  assert.match(unit, /StartLimitIntervalSec=300/);
  assert.match(unit, /StartLimitBurst=10/);
});
