'use strict';

// ---------------------------------------------------------------------------
// Where log records go.
//
// There is exactly one real destination: stdout, one JSON object per line.
// systemd redirects that to /var/log/crypto-tracker/backend.log, the CloudWatch
// agent tails the file, and CloudWatch Logs Insights queries it. The application
// therefore contains NO CloudWatch-specific code — it writes JSON to stdout and
// knows nothing about where that ends up. Swapping CloudWatch for Loki, or for
// anything else, is a change to the shipper on the box, never to this repo.
//
// The sink indirection is kept (rather than calling process.stdout.write from
// logger.js) for exactly two reasons, both load-bearing:
//   * tests install a capturing sink to assert on records without parsing stdout;
//   * 'none' silences telemetry entirely so a test run's log lines never bury
//     the test reporter's own output.
//
// TWO RULES:
//   1. Never throw. Telemetry failing must not fail the request it describes.
//   2. Never log its own failures through the logger — that is an infinite loop.
//      Failures go to stderr directly, rate-limited.
// ---------------------------------------------------------------------------

// Rule 2: one complaint per minute, no more.
let lastSinkErrorAt = 0;

function reportSinkFailure(message) {
  const now = Date.now();
  if (now - lastSinkErrorAt < 60000) return;
  lastSinkErrorAt = now;
  try {
    process.stderr.write(`[observability] sink failure (suppressed for 60s): ${message}\n`);
  } catch (err) {
    // stderr itself is gone. There is nowhere left to report to.
  }
}

// The only real destination. Needs no configuration, no network and no
// credential, which is what makes it reliable: if the CloudWatch agent is
// stopped, misconfigured, or its IAM grant is revoked, the process is unaffected
// and the lines are still on disk waiting to be shipped when it recovers.
function createStdoutSink() {
  return {
    name: 'stdout',
    write(record) {
      try {
        process.stdout.write(`${JSON.stringify(record)}\n`);
      } catch (err) {
        // A record containing something JSON.stringify refuses (a BigInt that
        // escaped redact(), a getter that throws) must not kill the request.
        reportSinkFailure(`stdout serialise: ${err && err.message}`);
      }
    },
    flush() {
      return Promise.resolve();
    },
  };
}

// Used by tests and by LOG_SINK=none.
function createNoopSink() {
  return { name: 'none', write() {}, flush: () => Promise.resolve() };
}

// LOG_SINK is the entire runtime configuration surface: 'stdout' (default) or
// 'none'. Deliberately not a connector registry — observability/connectors.json
// is metadata describing where logs END UP, and is never read at runtime.
function createSinksFromEnv(env = process.env) {
  return String(env.LOG_SINK || 'stdout').trim() === 'none' ? [createNoopSink()] : [createStdoutSink()];
}

module.exports = { createStdoutSink, createNoopSink, createSinksFromEnv };
