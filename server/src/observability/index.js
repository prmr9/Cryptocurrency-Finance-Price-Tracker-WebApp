'use strict';

// ---------------------------------------------------------------------------
// Public surface of the observability layer.
//
// Application code imports from HERE and never reaches into the sibling
// modules. That indirection is what keeps the destination swappable: the app
// writes structured JSON to stdout and contains no CloudWatch-specific logic at
// all, so replacing CloudWatch with Loki (or anything else) is a change to the
// shipper on the box and touches no application code.
//
// Usage:
//   const { logger } = require('./observability');
//   const log = logger.child({ component: 'auth' });
//   log.error('login failed', { error: err, user_id: id });
// ---------------------------------------------------------------------------

const { logger, createLogger, init, flush } = require('./logger');
const { requestContext, accessLog, errorHandler, normalizeRoute } = require('./httpLogging');
const { getContext, getCorrelationAttributes } = require('./context');
const { getResource, getEnvironment, getReleaseId } = require('./resource');
const { redact } = require('./redact');

// Called once at boot, before the port is bound. Returns the resolved
// configuration and states it out loud, so "which log level is this process
// actually running at" is answerable from the logs themselves rather than by
// SSHing in to read the systemd unit.
function initObservability(env = process.env) {
  const resolved = init(env);

  logger.info('observability initialised', {
    component: 'observability',
    log_level: resolved.level,
    sink: resolved.connectors.join(','),
  });

  return resolved;
}

// An uncaught exception or rejected promise is the single most valuable log line
// a service ever produces, and Node's default handler prints it unstructured to
// stderr — where it is neither JSON nor shipped, so it never reaches CloudWatch.
function installProcessHandlers(signals = ['SIGTERM', 'SIGINT']) {
  const handlers = [];

  for (const signal of signals) {
    const handler = () => {
      logger.info('shutting down', { component: 'observability', signal });
      flush().finally(() => process.exit(0));
    };
    process.once(signal, handler);
    handlers.push([signal, handler]);
  }

  process.on('uncaughtException', (err) => {
    logger.fatal('uncaught exception', { component: 'process', error: err });
    flush().finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { component: 'process', error: reason });
  });

  return () => handlers.forEach(([signal, handler]) => process.removeListener(signal, handler));
}

module.exports = {
  logger,
  createLogger,
  initObservability,
  installProcessHandlers,
  flush,
  requestContext,
  accessLog,
  errorHandler,
  normalizeRoute,
  getContext,
  getCorrelationAttributes,
  getResource,
  getEnvironment,
  getReleaseId,
  redact,
};
