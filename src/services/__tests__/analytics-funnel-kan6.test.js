import fs from 'fs';
import path from 'path';
import {
  track,
  configureAnalytics,
  resetAnalyticsForTest,
  getTrackedEventsForTest,
  LOCAL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  readLocalState,
  writeLocalState,
  getClientId,
  getOrCreateSessionId,
  resolveEntryMethod,
  classifyReferrer,
  classifyFailure,
  recordExposure,
  recordFlowStartedOnce,
  recordSuccess,
} from '../analytics';

const ANALYTICS_PATH = path.resolve(__dirname, '..', 'analytics.js');
const source = fs.readFileSync(ANALYTICS_PATH, 'utf8');

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  resetAnalyticsForTest();
});

afterEach(() => {
  resetAnalyticsForTest();
});

// AC1
test('declares the exact KAN-6 storage keys', () => {
  expect(LOCAL_STORAGE_KEY).toBe('coinsearch.analytics.v1');
  expect(SESSION_STORAGE_KEY).toBe('coinsearch.analytics.session.v1');
  expect(source).toContain("LOCAL_STORAGE_KEY = 'coinsearch.analytics.v1'");
  expect(source).toContain("SESSION_STORAGE_KEY = 'coinsearch.analytics.session.v1'");
});

// AC2
test('the session id is read from and written to sessionStorage, not localStorage or a module var', () => {
  expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

  const id = getOrCreateSessionId();
  expect(typeof id).toBe('string');
  expect(id).toMatch(/^sess_/);

  // It was persisted to sessionStorage under the session key...
  const persisted = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  expect(persisted).not.toBeNull();
  expect(JSON.parse(persisted).sessionId).toBe(id);

  // ...and not to localStorage.
  expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  const local = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  expect(local === null || !local.includes(id)).toBe(true);

  // Idempotent: a second call returns the same persisted id (survives reload).
  expect(getOrCreateSessionId()).toBe(id);
});

// AC2 (reinforcement): the session id that track() stamps on every emitted event
// is the sessionStorage-backed id under SESSION_STORAGE_KEY, so the id that leaves
// the module lives in sessionStorage rather than in a module var or localStorage.
test('track stamps the sessionStorage-backed session id on emitted events', () => {
  track('feature_flow_started', { user_id: 'anon_1' });

  const [event] = getTrackedEventsForTest();
  const persisted = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

  expect(persisted).not.toBeNull();
  expect(event.session_id).toBe(JSON.parse(persisted).sessionId);
  expect(event.session_id).toBe(getOrCreateSessionId());
});

// AC3
test('track never throws and its body is enclosed in try/catch with no throw', () => {
  expect(() => track('feature_entry_point_viewed', { user_id: 'anon_1' })).not.toThrow();

  const trackStart = source.indexOf('export const track =');
  // Bound the slice to the track function itself (up to the KAN-6 divider that
  // immediately follows it) so surrounding comments are not inspected.
  const bodyOnly = source.slice(trackStart, source.indexOf('// -----', trackStart));
  expect(bodyOnly).toContain('try {');
  expect(bodyOnly).toContain('catch');
  // No throw statement on any path within track's body.
  expect(/\bthrow\b/.test(bodyOnly)).toBe(false);
});

// AC4
test('classifyReferrer returns only the enum and never leaks path or query', () => {
  const origin = 'https://coinsearch.example';
  const url = `${origin}/accounts/secret-path?wallet=0xdeadbeef&label=my+savings`;

  expect(classifyReferrer(url, origin)).toBe('same_origin');
  expect(classifyReferrer('https://evil.example/x?y=z', origin)).toBe('external');
  expect(classifyReferrer('', origin)).toBe('direct');
  expect(classifyReferrer('not a url', origin)).toBe('direct');

  const out = classifyReferrer(url, origin);
  expect(['same_origin', 'external', 'direct']).toContain(out);
  expect(out).not.toMatch(/secret-path|wallet|0xdeadbeef|savings/);
});

// AC5
test('classifyFailure maps unknown messages to "unknown" and never returns the raw message', () => {
  const err = new Error('kaboom-1234 unexpected internal detail');
  expect(classifyFailure(err)).toBe('unknown');
  expect(classifyFailure(err)).not.toBe(err.message);

  expect(classifyFailure(new Error('Label is required'))).toBe('missing_field');
  expect(classifyFailure(new Error('Enter a valid public wallet address'))).toBe('invalid_address');
  expect(classifyFailure(new Error('That address has already been added'))).toBe('duplicate_account');
});

// AC6
test('writeLocalState re-reads immediately before setItem and appends to successDays', () => {
  // Seed one success already on disk.
  window.localStorage.setItem(
    LOCAL_STORAGE_KEY,
    JSON.stringify({ v: 1, clientId: 'anon_x', firstExposureConsumed: false, firstValueReachedAt: 100, successDays: [100] })
  );

  const result = writeLocalState((s) => {
    s.successDays.push(200);
  });

  // Appended, not replaced: the pre-existing 100 is still present.
  expect(result.successDays).toEqual([100, 200]);
  expect(JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY)).successDays).toEqual([100, 200]);

  // Source-level guarantee: readLocalState is called and there is no await
  // between that read and the setItem write.
  const fnStart = source.indexOf('export const writeLocalState =');
  const fnBody = source.slice(fnStart, source.indexOf('\nconst emptySessionState', fnStart));
  const readIdx = fnBody.indexOf('readLocalState()');
  const setIdx = fnBody.indexOf('setItem');
  expect(readIdx).toBeGreaterThan(-1);
  expect(setIdx).toBeGreaterThan(readIdx);
  expect(fnBody.slice(readIdx, setIdx)).not.toContain('await');
});

// AC7
test('every exported record*/get*/classify*/resolve* helper and track survive storage that throws', () => {
  const boom = () => {
    throw new Error('SecurityError: storage disabled');
  };
  const origLocal = window.localStorage;
  const origSession = window.sessionStorage;

  const throwingStorage = {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
  };

  Object.defineProperty(window, 'localStorage', { value: throwingStorage, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: throwingStorage, configurable: true });

  try {
    expect(() => track('feature_flow_started', { user_id: 'anon_1' })).not.toThrow();
    expect(() => getClientId()).not.toThrow();
    expect(() => getOrCreateSessionId()).not.toThrow();
    expect(() => recordExposure('navbar')).not.toThrow();
    expect(() => recordFlowStartedOnce()).not.toThrow();
    expect(() => recordSuccess()).not.toThrow();
    expect(() => readLocalState()).not.toThrow();
    expect(() => writeLocalState((s) => { s.clientId = 'x'; })).not.toThrow();
    expect(() => classifyReferrer('https://x.example/p?q=1', 'https://x.example')).not.toThrow();
    expect(() => classifyFailure(new Error('x'))).not.toThrow();
    expect(() => resolveEntryMethod()).not.toThrow();
  } finally {
    Object.defineProperty(window, 'localStorage', { value: origLocal, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: origSession, configurable: true });
  }
});

// AC8
test('recordExposure returns isFirstExposure true then false against the same persisted state', () => {
  const first = recordExposure('navbar');
  expect(first.isFirstExposure).toBe(true);

  const second = recordExposure('navbar');
  expect(second.isFirstExposure).toBe(false);
});

// Extra: first-value / retention semantics with the injectable clock.
test('recordSuccess prunes across a 7-local-day window and counts usage', () => {
  let now = Date.UTC(2026, 2, 6, 12, 0, 0); // fixed base; DST boundary lands in this window in many zones
  configureAnalytics({ now: () => now });

  const r1 = recordSuccess();
  expect(r1.isFirstSuccess).toBe(true);
  expect(r1.usageCount7d).toBe(1);
  expect(r1.daysSinceFirstValue).toBe(0);

  // Same local day: still one calendar day, count 2, not a later-day reuse.
  now += 2 * 60 * 60 * 1000;
  const r2 = recordSuccess();
  expect(r2.isFirstSuccess).toBe(false);
  expect(r2.usageCount7d).toBe(2);

  // Three local days later: within the 7-day window, reuse on a later day.
  now += 3 * DAY_MS;
  const r3 = recordSuccess();
  expect(r3.isLaterDayReuse).toBe(true);
  expect(r3.usageCount7d).toBe(3);
  expect(r3.daysSinceFirstValue).toBeGreaterThanOrEqual(3);

  // Ten local days after the very first success: the first two fall outside the
  // window and are pruned, so only recent successes remain counted.
  now = Date.UTC(2026, 2, 16, 12, 0, 0) + DAY_MS; // > 7 days past the base
  const r4 = recordSuccess();
  expect(r4.usageCount7d).toBeLessThanOrEqual(2);
  expect(readLocalState().successDays.every((ts) => ts >= Date.UTC(2026, 2, 6, 12, 0, 0))).toBe(true);
});

// Extra: getClientId is a stable anonymous id persisted in localStorage.
test('getClientId returns a stable anon id persisted in localStorage', () => {
  const id = getClientId();
  expect(id).toMatch(/^anon_/);
  expect(getClientId()).toBe(id);
  expect(JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY)).clientId).toBe(id);
});
