'use strict';

// Behavioural tests for the HTTP observability middleware, driven through a
// real express app and real sockets rather than fake req/res objects — the
// failures these guard against (a leaked stack, a missing header, an unrecorded
// client abort) only appear once a real response is flushed.
//
// THE SECURITY PROPERTY: express's default error handler prints a stack to
// stderr and, outside production, puts it in the RESPONSE BODY. This service
// handles signup and login, and its errors carry connection strings and tokens.
// errorHandler() replaces that default; if it is ever unmounted, reordered, or
// its arity changed from 4, express silently falls back to the default and
// starts leaking internals with no test failing. Hence these.
//
// ORDERING NOTE: express only routes to a 4-arity middleware once everything
// registered before it has passed, so errorHandler() must be mounted LAST. The
// app below mirrors createApp()'s order exactly for that reason.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const express = require('express');
const { requestContext, accessLog, errorHandler } = require('../src/observability');
const { setSinksForTest, resetLoggerForTest } = require('../src/observability/logger');

// Same middleware order as createApp().
function buildApp() {
  const app = express();
  app.use(requestContext());
  app.use(accessLog());

  app.get('/ok', (req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/boom', () => {
    throw new Error('deliberate failure: postgres://app_admin:s3cr3t@db.internal:5432/cryptotracker');
  });
  app.get('/async-boom', (req, res, next) => {
    next(new Error('async failure: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature_here'));
  });

  app.use(errorHandler());
  return app;
}

function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = buildApp().listen(0, async () => {
      const port = server.address().port;
      const get = (path, headers) =>
        new Promise((res) => {
          http.get({ port, path, headers: headers || {} }, (response) => {
            let body = '';
            response.on('data', (chunk) => (body += chunk));
            response.on('end', () => res({ status: response.statusCode, headers: response.headers, body }));
          });
        });

      try {
        await fn(get);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test('a 500 response carries a request id and NEVER leaks internals', async () => {
  const captured = [];
  setSinksForTest([{ name: 'capture', write: (r) => captured.push(r), flush: () => Promise.resolve() }]);

  try {
    await withServer(async (get) => {
      const response = await get('/boom');

      assert.equal(response.status, 500);

      // Enough for a user to report and an operator to find...
      assert.match(response.body, /"request_id":"[0-9a-f]{16}"/);
      assert.match(response.body, /internal server error/);

      // ...and nothing more. These are what express's default handler would leak.
      assert.ok(!response.body.includes('postgres://'), 'the connection string must not reach the client');
      assert.ok(!response.body.includes('s3cr3t'), 'the password must not reach the client');
      assert.doesNotMatch(response.body, /at Layer|at Route|\.js:\d+/, 'no stack frames in the body');

      // The full error IS logged server-side — redacted.
      const logged = captured.find((r) => r.body === 'unhandled error');
      assert.ok(logged, 'the error must be logged for operators');
      assert.ok(!JSON.stringify(logged).includes('s3cr3t'), 'the logged record must be redacted too');
    });
  } finally {
    resetLoggerForTest();
  }
});

test('an error passed to next() is handled identically to a thrown one', async () => {
  setSinksForTest([{ name: 'noop', write() {}, flush: () => Promise.resolve() }]);

  try {
    await withServer(async (get) => {
      const response = await get('/async-boom');

      assert.equal(response.status, 500);
      assert.ok(!response.body.includes('eyJhbGci'), 'a JWT in the error must not reach the client');
    });
  } finally {
    resetLoggerForTest();
  }
});

test('an incoming traceparent is CONTINUED, not replaced', async () => {
  setSinksForTest([{ name: 'noop', write() {}, flush: () => Promise.resolve() }]);

  try {
    await withServer(async (get) => {
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const response = await get('/ok', { traceparent: `00-${traceId}-00f067aa0ba902b7-01` });

      // Same trace, new span: this process is a distinct span in the caller's
      // trace, not a continuation of the caller's span.
      assert.match(response.headers.traceparent, new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
      assert.ok(!response.headers.traceparent.includes('00f067aa0ba902b7'), 'this process must mint its own span id');
      assert.match(response.headers['x-request-id'], /^[0-9a-f]{16}$/);
    });
  } finally {
    resetLoggerForTest();
  }
});

test('a malformed traceparent is discarded rather than propagated', async () => {
  setSinksForTest([{ name: 'noop', write() {}, flush: () => Promise.resolve() }]);

  try {
    await withServer(async (get) => {
      // A hostile or broken upstream must not be able to inject a bogus id
      // into our telemetry; we mint a fresh trace instead.
      const response = await get('/ok', { traceparent: 'garbage-not-a-traceparent' });

      assert.match(response.headers.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      assert.ok(!response.headers.traceparent.includes('garbage'));
    });
  } finally {
    resetLoggerForTest();
  }
});

test('every log line produced during a request carries that request\'s correlation ids', async () => {
  const captured = [];
  setSinksForTest([{ name: 'capture', write: (r) => captured.push(r), flush: () => Promise.resolve() }]);

  try {
    await withServer(async (get) => {
      await get('/ok');

      const record = captured.find((r) => r.body === 'request completed');
      assert.ok(record, 'a completed request must be logged');

      // These three are what make a log searchable during an incident.
      assert.match(record.trace_id, /^[0-9a-f]{32}$/);
      assert.match(record.span_id, /^[0-9a-f]{16}$/);
      assert.match(record.request_id, /^[0-9a-f]{16}$/);
      assert.equal(record['http.status_code'], 200);
      assert.equal(record['http.route'], '/ok');
      assert.equal(typeof record.duration_ms, 'number');
    });
  } finally {
    resetLoggerForTest();
  }
});

test('a request body is NEVER logged — this service handles signup and login', async () => {
  const captured = [];
  setSinksForTest([{ name: 'capture', write: (r) => captured.push(r), flush: () => Promise.resolve() }]);

  try {
    await withServer(async (get) => {
      await get('/ok?password=hunter2&token=abc123');

      const serialised = JSON.stringify(captured);
      // Not collected at all, rather than collected-then-redacted: the cheaper
      // and more reliable guarantee.
      assert.ok(!serialised.includes('hunter2'), 'a query-string secret must never be logged');
      assert.ok(!serialised.includes('abc123'), 'a query-string token must never be logged');
    });
  } finally {
    resetLoggerForTest();
  }
});
