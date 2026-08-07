'use strict';

// ---------------------------------------------------------------------------
// Express middleware: request context, access logging, terminal error handler.
//
// ORDER MATTERS. requestContext() must be mounted BEFORE any other middleware,
// so that every downstream line — including one logged by a body parser
// rejecting malformed JSON — lands inside the AsyncLocalStorage scope and
// carries the request id. The error handler must be mounted LAST, because
// express only routes to a 4-arity middleware after everything before it.
//
// WHY THE ACCESS LOG CARRIES method / route / status / duration: these four
// fields are what make a metrics system unnecessary here. CloudWatch Logs
// Insights computes request rate, error rate and p99 latency directly from
// them, at no cost, so there is no /metrics endpoint, no custom metrics and no
// EMF in this design. See OBSERVABILITY.md for the queries.
//
// WHAT IS DELIBERATELY NOT LOGGED: request bodies and query strings. This
// service handles signup and login, so a body is a password and a query string
// is the classic place a token ends up. redact.js would catch the shapes it
// knows, but the cheaper and more reliable guarantee is not to collect them at
// all. Method, route, status and duration answer the operational questions
// without holding anything worth stealing.
//
// ROUTE IS THE TEMPLATE, NOT THE URL. normalizeRoute() collapses /portfolios/abc
// to /portfolios/:id and unmatched paths to __unmatched__. Nothing bills per
// distinct value here, but a Logs Insights `stats ... by route` is unreadable if
// every id is its own row, and a scanner hitting random URLs would drown it.
// ---------------------------------------------------------------------------

const { contextFromHeaders, runWithContext, getContext, formatTraceparent } = require('./context');
const { logger } = require('./logger');

const log = logger.child({ component: 'http' });

// Establishes the correlation context and echoes it back to the caller, so a
// client holding a failed response can quote an id that appears verbatim in the
// logs.
function requestContext() {
  return function requestContextMiddleware(req, res, next) {
    const ctx = contextFromHeaders(req.headers);

    res.setHeader('x-request-id', ctx.requestId);
    res.setHeader('traceparent', formatTraceparent(ctx));

    runWithContext(ctx, () => next());
  };
}

// Collapses a raw URL onto its route template. Express fills req.route.path only
// for matched routes, so unmatched requests (404s, probes, scanners) collapse to
// a single bucket rather than one row each.
function normalizeRoute(req) {
  if (req && req.route && typeof req.route.path === 'string') {
    const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
    const path = req.route.path === '/' && base ? '' : req.route.path;
    return `${base}${path}` || '/';
  }

  const raw = req && typeof req.path === 'string' ? req.path : '/';
  if (raw === '/health') return raw;
  return '__unmatched__';
}

function accessLog() {
  return function accessLogMiddleware(req, res, next) {
    const ctx = getContext();
    const startedAt = ctx ? ctx.startedAt : process.hrtime.bigint();

    // 'finish' fires once the response is flushed, which is where the real
    // duration and the final status are both known. 'close' covers the client
    // hanging up mid-response — without it, an aborted request records nothing
    // and a client-abort storm looks like silence rather than a symptom.
    let recorded = false;
    const record = (aborted) => {
      if (recorded) return;
      recorded = true;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const status = aborted ? 499 : res.statusCode;

      const fields = {
        'http.method': req.method,
        'http.route': normalizeRoute(req),
        'http.status_code': status,
        duration_ms: Math.round(durationMs * 100) / 100,
        // The forwarded client IP, only when nginx set it. Useful for abuse
        // triage; never combined with a body or a query string.
        ...(req.headers['x-forwarded-for']
          ? { 'client.ip': String(req.headers['x-forwarded-for']).split(',')[0].trim() }
          : {}),
      };

      // Health probes are constant background traffic: logged at debug, where
      // they stay queryable without burying everything else at info.
      if (status >= 500) log.error('request failed', fields);
      else if (status >= 400) log.warn('request rejected', fields);
      else if (req.path === '/health') log.debug('request completed', fields);
      else log.info('request completed', fields);
    };

    res.on('finish', () => record(false));
    res.on('close', () => {
      if (!res.writableEnded) record(true);
    });

    next();
  };
}

// Terminal error handler. Express's default prints a stack to stderr and, in
// development, into the response body — both unacceptable here: the first is
// unstructured, the second leaks internals to a caller. This logs the full error
// with correlation and returns a body carrying only the request id, which is
// exactly enough for a user to report and an operator to find.
function errorHandler() {
  // eslint-disable-next-line no-unused-vars -- express identifies an error
  // handler by arity; `next` must stay in the signature even though it is
  // unused, or express treats this as ordinary middleware and never calls it.
  return function errorHandlerMiddleware(err, req, res, next) {
    const ctx = getContext();

    log.error('unhandled error', {
      'http.method': req.method,
      'http.route': normalizeRoute(req),
      error: err,
    });

    if (res.headersSent) {
      // Too late for a status: the response is already streaming. Destroying it
      // signals failure to the client instead of leaving a truncated body that
      // looks successful.
      return res.destroy();
    }

    res.status(500).json({
      status: 'error',
      message: 'internal server error',
      request_id: ctx ? ctx.requestId : undefined,
    });
  };
}

module.exports = { requestContext, accessLog, errorHandler, normalizeRoute };
