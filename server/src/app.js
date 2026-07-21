'use strict';

// ---------------------------------------------------------------------------
// Express application factory (KAN-13 / contracts C4, C9).
//
// createApp() builds the app WITHOUT binding a port so tests can drive it (or
// mount it in-process) directly. Binding a port is index.js's job. This is the
// first web tier in the repo and the sole DB-facing HTTP service.
//
// Mounted here:
//   * cookie-parser  -> populates req.cookies for requireSession;
//   * GET /health    -> the secret->DB->HTTPS chain probe (C4);
//   * a periodic denylist sweep timer (C9) that evicts expired in-memory
//     revocations. The timer is unref'd so it never keeps `node --test` (or any
//     short-lived process) alive.
//
// The auth PRIMITIVES (issueSession/requireSession/revokeSession) are exported
// from src/auth/session.js for KAN-14 to mount its /auth routes on; this ticket
// wires the mechanism and the health slice, not those endpoints.
// ---------------------------------------------------------------------------

const express = require('express');
const cookieParser = require('cookie-parser');

const { healthHandler } = require('./routes/health');
const { sweepDenylist } = require('./auth/session');

// How often to prune expired in-memory revocations.
const DENYLIST_SWEEP_INTERVAL_MS = 60 * 1000;

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // C4 — end-to-end health slice.
  app.get('/health', healthHandler);

  // C9 — keep the in-memory denylist bounded. unref() so this timer never keeps
  // the process (or a test run) alive on its own.
  const sweepTimer = setInterval(sweepDenylist, DENYLIST_SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
  // Expose so a host that wants deterministic shutdown can clear it.
  app.locals.sweepTimer = sweepTimer;

  return app;
}

module.exports = { createApp, DENYLIST_SWEEP_INTERVAL_MS };
