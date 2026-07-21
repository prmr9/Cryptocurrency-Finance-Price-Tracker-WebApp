'use strict';

// ---------------------------------------------------------------------------
// Pinned RDS CA bundle (KAN-11 / contract C3).
//
// getRdsCa() returns the Amazon RDS global CA bundle shipped in the repo
// (certs/rds-global-bundle.pem). Pinning this bundle -- together with
// rejectUnauthorized:true at every call site (pool.js, migrate.js) -- means
// TLS verification is genuine and is NEVER disabled.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const DEFAULT_CA_PATH = path.join(
  __dirname,
  '..',
  '..',
  'certs',
  'rds-global-bundle.pem'
);

function getRdsCa(caPath = DEFAULT_CA_PATH) {
  return fs.readFileSync(caPath, 'utf8');
}

module.exports = { getRdsCa, DEFAULT_CA_PATH };
