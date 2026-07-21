/**
 * KAN-8 regression test.
 *
 * KAN-8 requires the KAN-7 restyle to be instrumented. The analytics plan
 * specifies a `prices_viewed` activation event that must fire when the home
 * Prices route mounts and the top-50 coin cards render from the axios fetch:
 *
 *   track("prices_viewed", { user_id, session_id, coins_loaded_count, load_ms, theme })
 *
 * On the current (un-instrumented) code this event is never emitted from any
 * production source file, so this test FAILS. Once the `prices_viewed` track
 * call is added (per the plan), the assertion passes.
 *
 * This is a source-level assertion (not a render mock) so it is robust to the
 * exact component/hook the fix chooses to place the call in, while still
 * pinning the exact behaviour the bug violates: the event is not instrumented.
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..', '..'); // repo/src

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.jsx?$/.test(entry.name)) continue;
    if (/\.test\.jsx?$/.test(entry.name)) continue; // exclude test files
    if (/setupTests/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

describe('KAN-8: prices_viewed instrumentation for the KAN-7 Prices route', () => {
  const files = collectSourceFiles(SRC_DIR);

  test('a production source file emits a track("prices_viewed", ...) call', () => {
    // track("prices_viewed" | track('prices_viewed' | track(`prices_viewed`
    const trackCall = /track\s*\(\s*['"`]prices_viewed['"`]/;

    const emitting = files.filter((file) => {
      const src = fs.readFileSync(file, 'utf8');
      return trackCall.test(src);
    });

    // Expected the Prices route to instrument the `prices_viewed` activation
    // event via track("prices_viewed", {...}). If this fails, no production
    // source file in src/ emits it. Scanned files:
    //   files.map((f) => path.relative(SRC_DIR, f)).join('\n')
    // NOTE: Jest's expect() takes exactly one argument, so the diagnostic
    // message cannot be passed as a second argument here.
    expect(emitting.length).toBeGreaterThan(0);
  });
});
