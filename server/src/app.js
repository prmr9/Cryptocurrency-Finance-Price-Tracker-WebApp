'use strict';

// ---------------------------------------------------------------------------
// Express application factory (KAN-13 / contracts C4, C9; KAN-14 / C10-C13).
//
// createApp() builds the app WITHOUT binding a port so tests can drive it (or
// mount it in-process) directly. Binding a port is index.js's job. This is the
// first web tier in the repo and the sole DB-facing HTTP service.
//
// Mounted here:
//   * cookie-parser  -> populates req.cookies for requireSession;
//   * GET /health    -> the secret->DB->HTTPS chain probe (C4);
//   * /auth router   -> signup/login/logout/me (KAN-14, C10-C13);
//   * /portfolios    -> GET/PUT portfolio holdings (KAN-15, C14-C15), behind
//     requireSession;
//   * /me            -> POST /me/import, localStorage backfill (KAN-15, C16),
//     behind requireSession;
//   * a periodic denylist sweep timer (C9) that evicts expired in-memory
//     revocations. The timer is unref'd so it never keeps `node --test` (or any
//     short-lived process) alive.
// ---------------------------------------------------------------------------

const express = require('express');
const cookieParser = require('cookie-parser');

const { healthHandler } = require('./routes/health');
const { router: authRouter } = require('./routes/auth');
const { router: portfoliosRouter } = require('./routes/portfolios');
const { router: meRouter } = require('./routes/me');
const { sweepDenylist, requireSession } = require('./auth/session');

// How often to prune expired in-memory revocations.
const DENYLIST_SWEEP_INTERVAL_MS = 60 * 1000;

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // C4 — end-to-end health slice.
  app.get('/health', healthHandler);

  // C10–C13 — auth endpoints (signup/login/logout/me) mounted under /auth.
  app.use('/auth', authRouter);

  // C14–C16 — portfolio data endpoints, reusing the same requireSession
  // middleware instance as /auth/me.
  app.use('/portfolios', requireSession, portfoliosRouter);
  app.use('/me', requireSession, meRouter);

  // C9 — keep the in-memory denylist bounded. unref() so this timer never keeps
  // the process (or a test run) alive on its own.
  const sweepTimer = setInterval(sweepDenylist, DENYLIST_SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
  app.locals.sweepTimer = sweepTimer;
  // Teardown seam so the timer is never leaked: closeApp(app) — or this local —
  // clears the interval on graceful shutdown / at the end of a test. Idempotent.
  app.locals.stopDenylistSweep = () => clearInterval(sweepTimer);

  return app;
}

// Stop the background work started by createApp() (currently the denylist sweep
// timer). Call on graceful shutdown or in test teardown so no interval leaks.
function closeApp(app) {
  if (app && app.locals && typeof app.locals.stopDenylistSweep === 'function') {
    app.locals.stopDenylistSweep();
  }
}

module.exports = { createApp, closeApp, DENYLIST_SWEEP_INTERVAL_MS };
