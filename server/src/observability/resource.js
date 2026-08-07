'use strict';

// ---------------------------------------------------------------------------
// OTEL resource attributes — the identity stamped on every log record, metric
// sample, and span this process emits.
//
// THE POINT: release_id / git_sha / deploy_id come from the SAME release.json
// that GET /health serves (written by deploy-backend-ec2.sh into the release
// directory). That shared origin is what makes deploy-correlated observability
// work at all: a spike in http_request_errors_total carries the release_id that
// caused it, the deploy_id that shipped it, and the git_sha to diff — so
// "which deploy broke this" is a label lookup rather than an investigation.
//
// It is also what lets DevAgent's bake window distinguish "errors from the new
// release" from "errors that were already happening" instead of comparing two
// undifferentiated time ranges and guessing.
//
// DUPLICATION IS DELIBERATE: routes/health.js reads this same file with its own
// field allowlist, and this module does NOT reuse that reader. health.js's 200
// body shape is a pinned public contract (health.test.js) — coupling it to the
// logger's resource builder would let a change here alter an API response.
// Two readers of one file is the cheaper trade.
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');

// src/observability/resource.js -> <release root>/release.json
const RELEASE_MANIFEST_PATH = path.join(__dirname, '..', '..', 'release.json');

let cached;

function readReleaseManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RELEASE_MANIFEST_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    // Absent in local dev and in tests, which is normal and not an error. An
    // unknown release is reported as 'unknown' rather than omitted, so a
    // dashboard query grouping by release_id still has a bucket to put these
    // in instead of silently dropping the series.
    return {};
  }
}

function str(value, fallback) {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

// The resource is immutable for the lifetime of the process: a release cannot
// change under a running process, and caching keeps the per-record cost at zero.
function getResource() {
  if (cached) return cached;

  const manifest = readReleaseManifest();

  cached = {
    'service.name': str(process.env.OTEL_SERVICE_NAME, 'crypto-tracker-backend'),
    'service.version': str(manifest.release_id, 'unknown'),
    'deployment.environment': str(manifest.environment, str(process.env.ENVIRONMENT, str(process.env.NODE_ENV, 'development'))),
    release_id: str(manifest.release_id, 'unknown'),
    git_sha: str(manifest.git_sha, 'unknown'),
    deploy_id: str(manifest.deploy_id, 'none'),
    deployed_at: str(manifest.deployed_at, 'unknown'),
    'host.name': os.hostname(),
    'process.pid': process.pid,
    'telemetry.sdk.language': 'nodejs',
    'telemetry.sdk.name': 'crypto-tracker-observability',
  };

  return cached;
}

// The environment label stamped on every record. Also what tells you, at a
// glance in CloudWatch, that you are looking at the right environment's logs.
function getEnvironment() {
  return getResource()['deployment.environment'];
}

function getReleaseId() {
  return getResource().release_id;
}

function resetResourceForTest() {
  cached = undefined;
}

module.exports = { getResource, getEnvironment, getReleaseId, resetResourceForTest, RELEASE_MANIFEST_PATH };
