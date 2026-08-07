'use strict';

// ---------------------------------------------------------------------------
// The structured logger.
//
// Replaces the repo's `console.error('[auth] login failed:', err.message)`
// pattern. That pattern is not wrong so much as unqueryable: the level lives in
// which console function was called, the subsystem lives in a bracket inside a
// string, and there is no request id, no release id and no trace. You cannot ask
// it "what is the 5xx rate for release X on route Y" without writing a parser.
//
// Every record here is one JSON object in the OTEL log data model, carrying:
//   resource attributes -- service, environment, release_id, git_sha, deploy_id
//   correlation         -- trace_id, span_id, request_id (from AsyncLocalStorage)
//   the caller's fields -- redacted at this boundary, never at the call site
//
// SHAPE IS THE CONTRACT. observability/service-manifest.json declares these
// field names to DevAgent, which binds to them when building dashboard queries.
// Renaming `severity` or dropping `release_id` breaks the integration, so
// server/test/observability-contract.test.js pins them.
// ---------------------------------------------------------------------------

const { getResource } = require('./resource');
const { getCorrelationAttributes } = require('./context');
const { redact } = require('./redact');
const { createSinksFromEnv } = require('./sinks');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const DEFAULT_LEVEL = 'info';

// Reserved top-level record keys. A caller field colliding with one of these is
// namespaced rather than allowed to overwrite it -- losing the real severity
// because someone logged `{ severity: 'whatever' }` would corrupt every query
// that filters on it.
const RESERVED = new Set(['timestamp', 'severity', 'body', 'trace_id', 'span_id', 'request_id']);

let level = DEFAULT_LEVEL;
let sinks = null;

function resolveLevel(env = process.env) {
  const configured = String(env.LOG_LEVEL || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, configured) ? configured : DEFAULT_LEVEL;
}

// Lazy so that requiring this module never performs I/O or opens a socket --
// tests import it freely, and a sink is only constructed once something is
// actually logged (or init() runs at boot).
function getSinks() {
  if (sinks === null) sinks = createSinksFromEnv();
  return sinks;
}

function isEnabled(candidate) {
  return LEVELS[candidate] >= LEVELS[level];
}

function buildRecord(severity, body, fields) {
  const record = {
    timestamp: new Date().toISOString(),
    severity,
    body: typeof body === 'string' ? body : String(body),
    ...getResource(),
    ...getCorrelationAttributes(),
  };

  const redacted = redact(fields || {});
  if (redacted && typeof redacted === 'object' && !Array.isArray(redacted)) {
    for (const [key, value] of Object.entries(redacted)) {
      record[RESERVED.has(key) ? `field.${key}` : key] = value;
    }
  }

  return record;
}

function emit(severity, body, fields) {
  if (!isEnabled(severity)) return null;

  let record;
  try {
    record = buildRecord(severity, body, fields);
  } catch (err) {
    // Building a record must never throw into the caller. A getter that throws
    // during redaction, a resource read failing -- degrade to the bare message
    // rather than turning a logged error into an unhandled one.
    record = { timestamp: new Date().toISOString(), severity, body: String(body), log_build_error: String(err && err.message) };
  }

  for (const sink of getSinks()) {
    try {
      sink.write(record);
    } catch (err) {
      // One broken sink must not stop the others. Same guarantee
      // src/services/analytics.js makes with deliverSafely().
    }
  }

  return record;
}

// A child logger pins fields onto every record it emits -- `log.child({
// component: 'auth' })` replaces the '[auth]' string prefixes, turning the
// subsystem into a queryable label instead of text to grep.
function createLogger(boundFields = {}) {
  const bind = (fields) => ({ ...boundFields, ...(fields || {}) });

  return {
    debug: (body, fields) => emit('debug', body, bind(fields)),
    info: (body, fields) => emit('info', body, bind(fields)),
    warn: (body, fields) => emit('warn', body, bind(fields)),
    error: (body, fields) => emit('error', body, bind(fields)),
    fatal: (body, fields) => emit('fatal', body, bind(fields)),
    child: (fields) => createLogger(bind(fields)),
  };
}

const rootLogger = createLogger();

function flush() {
  return Promise.all(getSinks().map((sink) => (typeof sink.flush === 'function' ? sink.flush() : Promise.resolve()))).then(() => undefined);
}

function init(env = process.env) {
  level = resolveLevel(env);
  sinks = createSinksFromEnv(env);
  return { level, connectors: sinks.map((sink) => sink.name) };
}

function setSinksForTest(nextSinks) {
  sinks = nextSinks;
}

function setLevelForTest(nextLevel) {
  level = Object.prototype.hasOwnProperty.call(LEVELS, nextLevel) ? nextLevel : DEFAULT_LEVEL;
}

function resetLoggerForTest() {
  level = DEFAULT_LEVEL;
  sinks = null;
}

module.exports = {
  logger: rootLogger,
  createLogger,
  init,
  flush,
  LEVELS,
  resolveLevel,
  setSinksForTest,
  setLevelForTest,
  resetLoggerForTest,
};
