'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// KAN-60: regression gate for post-merge CI fragility in .github/workflows/devagent-ci.yml.
// A node:test file (server/test/*.test.js) that reads the workflow as text and asserts the
// shape the fix must have. Uses only Node built-ins, so it adds no npm dependency (no
// package.json / package-lock.json change).

const WORKFLOW_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'devagent-ci.yml'
);

const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');

function leadingSpaces(line) {
  let n = 0;
  while (n < line.length && line[n] === ' ') n += 1;
  return n;
}

// The indented block of a named job (everything more-indented than the job key).
function jobBlock(content, jobName) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(jobName + ':') && leadingSpaces(lines[i]) > 0) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const keyIndent = leadingSpaces(lines[start]);
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      out.push(line);
      continue;
    }
    if (leadingSpaces(line) <= keyIndent) break;
    out.push(line);
  }
  return out.join('\n');
}

// A top-level block (a key at column 0 and everything indented beneath it).
function topLevelBlock(content, key) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(key + ':')) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i += 1) {
    const first = lines[i][0];
    if (lines[i].length > 0 && first !== ' ' && first !== '\t' && first !== '#') break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

test('node-server job runs npm ci and npm test scoped to the server directory', () => {
  const block = jobBlock(workflow, 'node-server');
  assert.ok(block, 'expected a node-server: job in the jobs: map');
  assert.match(
    block,
    /working-directory:\s*['"]?\.?\/?server\b/,
    'node-server must scope steps to server (defaults.run.working-directory or per-step)'
  );
  assert.match(block, /npm ci\b/, 'node-server job must run npm ci');
  assert.match(block, /npm test\b/, 'node-server job must run npm test');
});

test('node-server setup-node pins node 22 + server cache path and uses no Docker/services', () => {
  const block = jobBlock(workflow, 'node-server');
  assert.ok(block, 'expected a node-server: job in the jobs: map');
  assert.match(block, /actions\/setup-node/, 'node-server must use actions/setup-node');
  assert.match(block, /node-version:\s*['"]?22\b/, 'setup-node must set node-version: 22');
  assert.match(
    block,
    /cache-dependency-path:\s*['"]?server\/package-lock\.json/,
    'setup-node must set cache-dependency-path: server/package-lock.json'
  );
  assert.ok(!/\bservices:/.test(block), 'node-server must not declare a services: map');
  assert.ok(!/\bcontainer:/.test(block), 'node-server must not run inside a Docker container');
});

test('node-root frontend build runs with CI=true and never uses npm run build or CI=false', () => {
  assert.ok(!workflow.includes('npm run build'), 'frontend build must not use npm run build');
  assert.ok(!workflow.includes('CI=false'), 'workflow must not set CI=false');
  assert.match(workflow, /CI=true/, 'frontend build step must run with CI=true');
  assert.match(workflow, /react-scripts build/, 'frontend build must call react-scripts build');
});

test('a concurrency block cancels superseded runs for the same github.ref', () => {
  const block = topLevelBlock(workflow, 'concurrency');
  assert.ok(block, 'expected a top-level concurrency: block');
  assert.match(block, /group:[^\n]*\$\{\{\s*github\.ref\s*\}\}/, 'concurrency group must include github.ref');
  assert.match(block, /cancel-in-progress:/, 'concurrency block must set cancel-in-progress');
});
