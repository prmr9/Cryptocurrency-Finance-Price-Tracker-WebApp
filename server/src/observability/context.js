'use strict';

// ---------------------------------------------------------------------------
// Per-request correlation context (W3C Trace Context).
//
// WHY ASYNCLOCALSTORAGE AND NOT `req`: the value of a request id is that it
// appears on EVERY line produced while handling that request — including lines
// from db/pool.js, auth/session.js, and repos/*, none of which have access to
// `req` and none of which should have to grow a parameter just to be
// traceable. AsyncLocalStorage carries the context across await boundaries so
// those modules stay unaware of it entirely.
//
// WHY W3C traceparent SPECIFICALLY: it is the interoperable format every OTLP
// backend already understands. Emitting trace_id/span_id in this format from
// day one means that on the day someone switches on the otlp_http connector,
// existing logs join to new traces with no re-instrumentation — the ids were
// always there and were always shaped correctly.
//
// A trace id is generated when the caller does not supply one, so correlation
// works for direct hits too, not just requests arriving through a mesh.
// ---------------------------------------------------------------------------

const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');

const storage = new AsyncLocalStorage();

// traceparent := version "-" trace-id "-" parent-id "-" trace-flags
// e.g. 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);

function newTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function newSpanId() {
  return crypto.randomBytes(8).toString('hex');
}

// Returns null for anything malformed, so a hostile or broken upstream header
// can never inject a bogus id into our telemetry — we mint a fresh one instead.
function parseTraceparent(header) {
  if (typeof header !== 'string') return null;

  const match = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!match) return null;

  const [, version, traceId, parentId, flags] = match;

  // Version ff is forbidden by the spec; all-zero ids are the defined "invalid"
  // sentinels and must be treated as absent.
  if (version === 'ff' || traceId === INVALID_TRACE_ID || parentId === INVALID_SPAN_ID) return null;

  return {
    traceId,
    parentSpanId: parentId,
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}

function formatTraceparent(ctx) {
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

// Builds the context for an incoming request: continues the caller's trace when
// they sent a valid traceparent, starts a new one otherwise. Either way this
// process gets its OWN span id — it is a distinct span in the trace, not a
// continuation of the caller's.
function contextFromHeaders(headers = {}) {
  const parsed = parseTraceparent(headers.traceparent || headers.Traceparent);

  return {
    traceId: parsed ? parsed.traceId : newTraceId(),
    spanId: newSpanId(),
    parentSpanId: parsed ? parsed.parentSpanId : null,
    sampled: parsed ? parsed.sampled : true,
    // Short, human-quotable id. A user reporting "request 3f2a1b9c failed" is
    // more workable than asking them to read out 32 hex characters.
    requestId: crypto.randomBytes(8).toString('hex'),
    startedAt: process.hrtime.bigint(),
  };
}

function runWithContext(ctx, fn) {
  return storage.run(ctx, fn);
}

// Undefined outside a request (boot, timers, shutdown). Callers must treat the
// absence as normal — logging works fine without a trace, it just isn't joined.
function getContext() {
  return storage.getStore();
}

// The correlation fields to merge into a log record, or {} when there is no
// active request.
function getCorrelationAttributes() {
  const ctx = getContext();
  if (!ctx) return {};

  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    request_id: ctx.requestId,
  };
}

module.exports = {
  contextFromHeaders,
  runWithContext,
  getContext,
  getCorrelationAttributes,
  parseTraceparent,
  formatTraceparent,
  newTraceId,
  newSpanId,
};
