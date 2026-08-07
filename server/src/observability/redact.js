'use strict';

// ---------------------------------------------------------------------------
// Redaction at the emit boundary.
//
// CLAUDE.md's one rule is that credentials never reach code, logs, or PRs. A
// logger is the easiest place in a codebase to break that rule by accident:
// someone logs an error object that happens to carry a connection string, or
// spreads a request body that happens to contain a password.
//
// So redaction happens HERE, inside the emit path, and not at the call sites --
// the same argument analytics.js makes for hashing account ids in track()
// rather than in components. No caller can leak a secret by forgetting to
// scrub, because no caller is trusted to scrub.
//
// Two independent layers, because either one alone has a known gap:
//   1. KEY deny-list  -- catches `{ password: 'hunter2' }`, where the value is
//      unremarkable and only the key reveals what it is.
//   2. VALUE patterns -- catches a secret embedded in free text, such as a
//      postgres URL inside an error message, where there is no key to match.
//
// Cost is bounded on purpose: logging must never become the slow part of a
// request. Depth, breadth, and string length are all capped, and a cycle in the
// input is handled rather than blowing the stack.
// ---------------------------------------------------------------------------

// Substring-matched against the lower-cased key. Deliberately broad: a
// false-positive redaction costs one debugging session, a false negative
// costs a credential rotation.
const DENY_KEY_SUBSTRINGS = [
  'password',
  'passwd',
  'secret',
  'token',
  'jwt',
  'authorization',
  'cookie',
  'session_id',
  'sessionid',
  'apikey',
  'api_key',
  'access_key',
  'accesskey',
  'private_key',
  'privatekey',
  'credential',
  'connection_string',
  'connectionstring',
  'database_url',
  'db_url',
  'dsn',
  'bearer',
  'signature',
  'cvv',
];

// Applied to every string value that survives the key check.
const VALUE_PATTERNS = [
  // A JWT — three base64url segments, the first starting with the {"alg" header.
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g, '[redacted:jwt]'],
  // postgres://user:pass@host/db — the single most likely secret to appear in a
  // pg error message.
  [/\bpostgres(?:ql)?:\/\/\S+/gi, '[redacted:pg-url]'],
  // Any other URL carrying inline basic-auth credentials.
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/gi, '[redacted:url-credentials]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted:aws-key]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
  // An EVM wallet address. The frontend contract is that raw addresses never
  // reach a sink (see src/services/analytics.js); the backend holds the same
  // line so a log line cannot become the leak the frontend refused to be.
  [/\b0x[a-fA-F0-9]{40}\b/g, '[redacted:evm-address]'],
];

const MAX_DEPTH = 6;
const MAX_KEYS_PER_OBJECT = 64;
const MAX_ARRAY_ITEMS = 32;
const MAX_STRING_LENGTH = 4096;

const REDACTED = '[redacted]';

function keyIsSensitive(key) {
  const lowered = String(key).toLowerCase();
  return DENY_KEY_SUBSTRINGS.some((needle) => lowered.includes(needle));
}

// Exported so tests can assert the pattern layer independently of the walker.
function scrubString(value) {
  let out = value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  for (const [pattern, replacement] of VALUE_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function redact(input, depth = 0, seen = new Set()) {
  if (input === null || input === undefined) return input;

  const type = typeof input;
  if (type === 'string') return scrubString(input);
  if (type === 'number' || type === 'boolean') return input;
  if (type === 'bigint') return input.toString();
  // A function or symbol in a log payload is a mistake, not data.
  if (type === 'function' || type === 'symbol') return `[${type}]`;

  if (input instanceof Date) return input.toISOString();

  // Errors are the most common thing logged and do NOT serialise via JSON --
  // message and stack are non-enumerable, so a plain spread yields `{}`.
  if (input instanceof Error) {
    return {
      name: input.name,
      message: scrubString(String(input.message || '')),
      // The stack names files and line numbers, not values, but it embeds the
      // message verbatim on the first line, so it gets scrubbed too.
      stack: input.stack ? scrubString(String(input.stack)) : undefined,
      ...(input.code !== undefined ? { code: String(input.code) } : {}),
    };
  }

  if (depth >= MAX_DEPTH) return '[depth-limit]';

  if (Array.isArray(input)) {
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    const items = input.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1, seen));
    if (input.length > MAX_ARRAY_ITEMS) items.push(`[+${input.length - MAX_ARRAY_ITEMS} more]`);
    seen.delete(input);
    return items;
  }

  if (type === 'object') {
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    const out = {};
    const keys = Object.keys(input).slice(0, MAX_KEYS_PER_OBJECT);
    for (const key of keys) {
      if (keyIsSensitive(key)) {
        out[key] = REDACTED;
        continue;
      }

      // Reading the property can itself throw: an accessor defined with a
      // getter runs arbitrary code here. Without this guard, logging an object
      // that happens to expose a throwing getter turns a logged error into an
      // unhandled one -- the logger becoming the outage it was meant to explain.
      let value;
      try {
        value = input[key];
      } catch (err) {
        out[key] = '[getter-threw]';
        continue;
      }

      out[key] = redact(value, depth + 1, seen);
    }
    seen.delete(input);
    return out;
  }

  return String(input);
}

module.exports = { redact, scrubString, keyIsSensitive, DENY_KEY_SUBSTRINGS, REDACTED };
