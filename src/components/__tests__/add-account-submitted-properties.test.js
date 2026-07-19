// Regression test for KAN-5 (fix pass 1).
//
// Acceptance criterion:
//   Given src/components/Accounts.js
//   When the add_account_submitted track call is inspected
//   Then its properties object contains the keys label_provided,
//        address_format, and existing_account_count and does NOT
//        contain a key named address_length.
//
// This is a static source-inspection test: it parses the balanced object
// literal passed as the second argument to track("add_account_submitted", ...)
// and asserts on its top-level property keys. It fails on the current code
// (which carries address_length) and passes once the property is renamed to
// address_format.

const fs = require('fs');
const path = require('path');

const ACCOUNTS_SOURCE_PATH = path.resolve(__dirname, '..', 'Accounts.js');

function readAccountsSource() {
  return fs.readFileSync(ACCOUNTS_SOURCE_PATH, 'utf8');
}

// Returns the balanced { ... } object literal starting at the first '{'
// found at or after `fromIndex`. String contents are skipped so braces and
// quotes inside string values do not throw off the brace matching.
function extractBalancedObject(source, fromIndex) {
  const openIndex = source.indexOf('{', fromIndex);
  if (openIndex === -1) return null;

  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
}

// Splits the top-level entries of an object-literal string (outer braces
// included), respecting nesting and string boundaries.
function topLevelEntries(objectLiteral) {
  const inner = objectLiteral.slice(1, -1);
  const entries = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    const prev = inner[i - 1];
    if (quote) {
      current += ch;
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      entries.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) entries.push(current);
  return entries;
}

// Extracts the property key name from a single object entry, handling both
// explicit ({ key: value } / { "key": value }) and shorthand ({ key }) forms.
function keyOf(entry) {
  const trimmed = entry.trim();
  if (!trimmed || trimmed.startsWith('...')) return null;

  let depth = 0;
  let quote = null;
  let colonIndex = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const prev = trimmed[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ':' && depth === 0) {
      colonIndex = i;
      break;
    }
  }

  const rawKey = colonIndex === -1 ? trimmed : trimmed.slice(0, colonIndex);
  const match = rawKey.trim().replace(/^['"]|['"]$/g, '').match(/^[A-Za-z_$][\w$]*/);
  return match ? match[0] : null;
}

// Finds track("<eventName>", { ... }) and returns the top-level keys of its
// properties object, or null if the call/object cannot be located.
function getTrackPropertyKeys(source, eventName) {
  let index = source.indexOf(`"${eventName}"`);
  if (index === -1) index = source.indexOf(`'${eventName}'`);
  if (index === -1) return null;

  const objectLiteral = extractBalancedObject(source, index);
  if (!objectLiteral) return null;

  return topLevelEntries(objectLiteral)
    .map(keyOf)
    .filter(Boolean);
}

describe('KAN-5: add_account_submitted instrumentation properties', () => {
  test('the add_account_submitted track call exists in Accounts.js', () => {
    const keys = getTrackPropertyKeys(readAccountsSource(), 'add_account_submitted');
    expect(keys).not.toBeNull();
  });

  test('properties include label_provided, address_format, and existing_account_count', () => {
    const keys = getTrackPropertyKeys(readAccountsSource(), 'add_account_submitted');
    expect(keys).toEqual(
      expect.arrayContaining([
        'label_provided',
        'address_format',
        'existing_account_count',
      ]),
    );
  });

  test('properties do NOT include the legacy address_length key', () => {
    const keys = getTrackPropertyKeys(readAccountsSource(), 'add_account_submitted');
    expect(keys).not.toContain('address_length');
  });
});
