import {
  track,
  getSessionId,
  getOrCreateSessionId,
  getTrackedEventsForTest,
  resetAnalyticsForTest,
  SESSION_STORAGE_KEY,
} from '../analytics';

// KAN-6 reconciliation regression. getSessionId() and getOrCreateSessionId() are
// the SAME per-browser-session id, persisted in ONE on-disk format under
// SESSION_STORAGE_KEY: the JSON session-state blob that readSessionState and the
// per-session funnel gates read back. An earlier draft of getSessionId stored a
// bare string under that same key — a second format readSessionState could not
// JSON.parse — so these tests pin the single source of truth. Every assertion
// below fails against that bare-string draft and passes once the accessor aliases
// getOrCreateSessionId.
beforeEach(() => {
  resetAnalyticsForTest();
});

afterEach(() => {
  resetAnalyticsForTest();
});

describe('KAN-6 session id is a single source of truth', () => {
  test('a cold getSessionId() agrees with getOrCreateSessionId()', () => {
    const id = getSessionId();

    expect(typeof id).toBe('string');
    expect(id).toMatch(/^sess_/);
    // The bare-string draft minted a second, different id on the next reader.
    expect(getOrCreateSessionId()).toBe(id);
    expect(getSessionId()).toBe(id);
  });

  test('persists SESSION_STORAGE_KEY as the JSON blob, never a bare string', () => {
    const id = getSessionId();
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

    expect(raw).not.toBeNull();
    // JSON.parse on the bare-string draft ("sess_...") threw here.
    const parsed = JSON.parse(raw);
    expect(parsed.sessionId).toBe(id);
  });

  test('agrees with the id track() has already stamped on an event', () => {
    const stamped = track('feature_flow_started', { user_id: 'anon_1' }).session_id;

    const [event] = getTrackedEventsForTest();
    expect(event.session_id).toBe(stamped);
    // The bare-string draft read the JSON blob back verbatim, so this diverged.
    expect(getSessionId()).toBe(stamped);
  });

  test('never throws when sessionStorage is disabled', () => {
    const orig = window.sessionStorage;
    const boom = () => {
      throw new Error('SecurityError: storage disabled');
    };

    Object.defineProperty(window, 'sessionStorage', {
      value: { getItem: boom, setItem: boom, removeItem: boom },
      configurable: true,
    });

    try {
      expect(() => getSessionId()).not.toThrow();
      expect(typeof getSessionId()).toBe('string');
    } finally {
      Object.defineProperty(window, 'sessionStorage', { value: orig, configurable: true });
    }
  });
});
