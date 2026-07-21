// Regression test for KAN-5 — instrumentation of the KAN-4 wallet-account
// onboarding change. Encodes the two acceptance criteria that the prior
// attempt failed:
//
//   1. src/services/accountStore.js must stay untouched by KAN-5 (no
//      instrumentation / schema change leaked into the persistence layer).
//   2. Across Accounts.js and Navbar.js combined, the set of event-name
//      string literals passed as the first argument to track() must be
//      EXACTLY the eight approved event names — no more, no fewer.
//
// These criteria are pure static source analysis ("locate every track call",
// "the set of event-name string literals"), so the test reads the source files
// off disk rather than rendering components. It FAILS on the current code
// (wrong/extra/missing event names and/or an instrumented store) and PASSES
// once the instrumentation is corrected.

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

// Collect the first string-literal argument of every track(...) call.
function trackEventNames(source) {
  const names = [];
  const re = /\btrack\(\s*(['"`])([^'"`]+)\1/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    names.push(m[2]);
  }
  return names;
}

const APPROVED = [
  'accounts_view_opened',
  'add_account_submitted',
  'add_account_validation_failed',
  'account_added',
  'account_activated',
  'trade_link_clicked',
  'accounts_returned',
  'account_removed',
  'feature_entry_point_viewed',
];

// The events Navbar is responsible for emitting: its Trade anchor
// (trade_link_clicked, KAN-5) and its mount-time entry-point view
// (feature_entry_point_viewed, KAN-6).
const NAVBAR_EVENTS = ['trade_link_clicked', 'feature_entry_point_viewed'];

describe('KAN-5 analytics instrumentation', () => {
  const accountsSrc = read('components/Accounts.js');
  const navbarSrc = read('components/Navbar.js');
  const storeSrc = read('services/accountStore.js');

  const accountsNames = trackEventNames(accountsSrc);
  const navbarNames = trackEventNames(navbarSrc);
  const combined = new Set([...accountsNames, ...navbarNames]);

  test('emits exactly the eight approved events across Accounts.js and Navbar.js combined', () => {
    expect([...combined].sort()).toEqual([...APPROVED].sort());
  });

  test('introduces no event names outside the approved set', () => {
    const extras = [...combined].filter((n) => !APPROVED.includes(n));
    expect(extras).toEqual([]);
  });

  test('Accounts.js emits every approved event except the navbar-owned one', () => {
    const accountsExpected = APPROVED.filter((n) => !NAVBAR_EVENTS.includes(n));
    const accountsSet = new Set(accountsNames);
    const missing = accountsExpected.filter((n) => !accountsSet.has(n));
    expect(missing).toEqual([]);
  });

  test('Navbar.js owns the trade_link_clicked and feature_entry_point_viewed emissions and only those events', () => {
    expect(navbarNames).toContain('trade_link_clicked');
    expect(navbarNames).toContain('feature_entry_point_viewed');
    expect(navbarNames.every((n) => NAVBAR_EVENTS.includes(n))).toBe(true);
  });

  test('does not instrument the persistence layer (accountStore.js stays untouched by KAN-5)', () => {
    expect(storeSrc).not.toMatch(/\btrack\s*\(/);
  });
});
