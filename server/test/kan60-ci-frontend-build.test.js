'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Regression test for KAN-60 - post-merge CI fragility.
 *
 * Root cause (see KAN-57 "CI failed after merge"): the node-root frontend is a
 * Create React App project. `react-scripts build` promotes ESLint warnings to
 * errors whenever the CI environment variable is truthy, and GitHub Actions
 * always sets CI=true. A pull request could be green pre-merge and still break
 * after merge because the pre-merge gate did not build the frontend CI-strict,
 * so a warning first surfaced post-merge.
 *
 * The fix keeps the node-root frontend build step CI-strict: it runs the build
 * under CI=true (e.g. `CI=true npx react-scripts build`) so a warning fails this
 * pre-merge gate, and it never disables strictness with CI=false.
 *
 * This test FAILS while the build step disables strict CI and PASSES once the
 * node-root frontend build step runs under CI=true.
 */

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.github', 'workflows', 'devagent-ci.yml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const repoRoot = findRepoRoot(__dirname);
const workflowPath = repoRoot
  ? path.join(repoRoot, '.github', 'workflows', 'devagent-ci.yml')
  : null;
const raw = workflowPath ? fs.readFileSync(workflowPath, 'utf8') : '';

let doc = null;
try {
  // js-yaml resolves transitively in this repo (eslint depends on it). If it
  // cannot be resolved we fall back to the text scan below.
  const yaml = require('js-yaml');
  doc = yaml.load(raw);
} catch (err) {
  doc = null;
}

function isFalse(value) {
  return String(value).trim().toLowerCase() === 'false';
}

function isTrue(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function collectSteps(parsed) {
  const out = [];
  const jobs = (parsed && parsed.jobs) || {};
  Object.keys(jobs).forEach((jobName) => {
    const job = jobs[jobName] || {};
    const steps = Array.isArray(job.steps) ? job.steps : [];
    steps.forEach((step) => out.push({ jobName, job, step: step || {} }));
  });
  return out;
}

function buildsFrontend(run) {
  return (
    /react-scripts\s+build/.test(run) ||
    /npm\s+(?:run\s+)?build\b/.test(run) ||
    /\byarn\s+build\b/.test(run)
  );
}

function isRootFrontendBuild(entry) {
  const run = typeof entry.step.run === 'string' ? entry.step.run : '';
  if (!run) return false;
  const defaults = entry.job.defaults && entry.job.defaults.run;
  const wd = String(
    entry.step['working-directory'] ||
      (defaults && defaults['working-directory']) ||
      ''
  );
  const scopedToServer =
    /(^|[/\s'])server([/\s]|$)/.test(wd) || /cd\s+\.?\/?server\b/.test(run);
  if (scopedToServer) return false;
  return buildsFrontend(run);
}

function stepIsHardened(entry, parsed) {
  const run = typeof entry.step.run === 'string' ? entry.step.run : '';
  if (/\bCI\s*=\s*false\b/i.test(run) || /DISABLE_ESLINT_PLUGIN/.test(run)) {
    return true;
  }
  const envs = [entry.step.env, entry.job.env, parsed && parsed.env];
  return envs.some(
    (env) => env && (isFalse(env.CI) || isTrue(env.DISABLE_ESLINT_PLUGIN))
  );
}

function textFallback(text) {
  const found =
    /react-scripts\s+build/.test(text) ||
    /npm\s+(?:run\s+)?build\b/.test(text) ||
    /\byarn\s+build\b/.test(text);
  const hardened =
    /\bCI\s*=\s*false\b/i.test(text) ||
    /(^|\s)CI\s*:\s*['"]?false['"]?/im.test(text) ||
    /DISABLE_ESLINT_PLUGIN/.test(text);
  return { found, hardened };
}

function evaluate() {
  if (doc && doc.jobs) {
    const frontendBuilds = collectSteps(doc).filter(isRootFrontendBuild);
    if (frontendBuilds.length > 0) {
      return {
        found: true,
        hardened: frontendBuilds.some((entry) => stepIsHardened(entry, doc)),
      };
    }
  }
  return textFallback(raw);
}

test('KAN-60: devagent-ci.yml is present and readable', () => {
  assert.ok(
    repoRoot && workflowPath && fs.existsSync(workflowPath),
    'expected to locate .github/workflows/devagent-ci.yml from the test suite'
  );
  assert.ok(raw.length > 0, 'devagent-ci.yml should not be empty');
});

test('KAN-60: devagent-ci.yml defines a node-root frontend build step', () => {
  const result = evaluate();
  assert.ok(
    result.found,
    'expected a node-root frontend build step (react-scripts build / npm run build) in devagent-ci.yml'
  );
});

test('KAN-60: node-root frontend build step is CI-strict so warnings fail pre-merge', () => {
  const result = evaluate();
  assert.ok(result.found, 'precondition: node-root frontend build step must exist');
  assert.ok(
    !result.hardened,
    [
      'Regression (KAN-60 / KAN-57 "CI failed after merge"): the node-root frontend',
      'build step in .github/workflows/devagent-ci.yml must build the Create React App',
      'CI-strict so a warning fails the pre-merge gate here instead of surfacing',
      'post-merge. GitHub Actions sets CI=true; the step must keep it that way and',
      'must not neutralise strictness with CI=false or DISABLE_ESLINT_PLUGIN.',
      '',
      'Run the frontend build under CI=true, e.g. `CI=true npx react-scripts build`.',
    ].join('\n')
  );
  assert.match(
    raw,
    /\bCI\s*[:=]\s*["']?true["']?/i,
    'the node-root frontend build step must run under CI=true'
  );
});
