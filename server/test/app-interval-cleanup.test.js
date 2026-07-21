'use strict';

// Regression test for the KAN-13 code-quality finding:
//
//   server/src/app.js -- `setInterval` (the C9 denylist sweep) must be paired
//   with a `clearInterval` on shutdown so it does not leak a timer that keeps
//   the event loop alive.
//
// createApp() schedules the periodic sweep; closeApp() tears it down. This test
// drives that real seam under Node's built-in test runner (the framework the
// rest of server/test/*.test.js uses -- the suite is run via `node --test`, so
// the Jest globals this file previously relied on were undefined here). It wraps
// the global timer functions to observe that every interval createApp()
// schedules is cleared by closeApp(), and FAILS if any interval leaks.

const test = require('node:test');
const assert = require('node:assert');

const { createApp, closeApp } = require('../src/app');

test('closeApp() clears the interval createApp() scheduled (no leaked timer)', () => {
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;

  const scheduled = [];
  const cleared = [];

  global.setInterval = (...args) => {
    const handle = realSetInterval(...args);
    scheduled.push(handle);
    return handle;
  };
  global.clearInterval = (handle) => {
    cleared.push(handle);
    return realClearInterval(handle);
  };

  try {
    const app = createApp();

    // Sanity: createApp() registers at least one periodic interval.
    assert.ok(
      scheduled.length >= 1,
      'createApp() should schedule a background interval'
    );

    closeApp(app);

    // Every interval createApp() scheduled must have been cleared on shutdown --
    // the buggy code (no clearInterval) would leave one uncleared here.
    for (const handle of scheduled) {
      assert.ok(
        cleared.includes(handle),
        'every interval scheduled by createApp() must be cleared by closeApp()'
      );
    }
  } finally {
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
    // Safety net: never let an interval escape into the rest of the run.
    for (const handle of scheduled) realClearInterval(handle);
  }
});
