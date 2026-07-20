import fs from 'fs';
import path from 'path';
import {
  track,
  touchSession,
  getSessionInfo,
  configureAnalytics,
  flushAnalytics,
  noteInAppNavigation,
  resolveEntrySource,
  hashAccountId,
  classifyAddressFormat,
  noteAccountFirstSeen,
  notePreexistingAccounts,
  getAccountAgeDays,
  getRetentionContext,
  getTrackedEventsForTest,
  resetAnalyticsForTest,
  SESSION_TIMEOUT_MS,
} from '../analytics';

const ANALYTICS_KEY = 'cfpt.analytics.v1';
const ANALYTICS_PATH = path.resolve(__dirname, '..', 'analytics.js');
const source = fs.readFileSync(ANALYTICS_PATH, 'utf8');

const ADDR = '0x1111111111111111111111111111111111111111';
const DAY_MS = 24 * 60 * 60 * 1000;

// jsdom's performance object has no getEntriesByType, so the entry cannot be
// spied on — it has to be installed and torn down by hand.
const stubNavigationEntries = (impl) => {
  window.performance.getEntriesByType = impl;

  return () => {
    delete window.performance.getEntriesByType;
  };
};

const readPersisted = () => JSON.parse(window.localStorage.getItem(ANALYTICS_KEY));

const writePersisted = (patch) =>
  window.localStorage.setItem(
    ANALYTICS_KEY,
    JSON.stringify({ ...(readPersisted() || { v: 1 }), ...patch })
  );

// The default sink is a module-level ring buffer, so without a reset it carries
// events (and once full, its 200-item cap) from one test into the next. Reset
// before and after every test, mirroring analytics-funnel-kan6.test.js.
beforeEach(() => {
  resetAnalyticsForTest();
});

afterEach(() => {
  resetAnalyticsForTest();
});

describe('analytics storage key', () => {
  test('hands localStorage only this module\'s own keys, never KAN-4\'s account key', () => {
    expect(source).toMatch(/^const ANALYTICS_KEY = 'cfpt\.analytics\.v1'$/m);

    const calls = source.match(
      /window\.localStorage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g
    );

    expect(calls).not.toBeNull();
    expect(calls.length).toBeGreaterThan(0);
    // KAN-5's session/retention key plus KAN-6's funnel side-table key are the
    // only literals this module may hand to localStorage. The account key
    // ('coinsearch.accounts.v1') must never appear.
    calls.forEach((call) => {
      expect(call).toMatch(/\(\s*(?:ANALYTICS_KEY|LOCAL_STORAGE_KEY)\s*$/);
    });
    expect(source).not.toContain('coinsearch.accounts');
  });

  test('KAN-5 activity-window session state lives in localStorage, not fabricated per-tab', () => {
    // KAN-6 adds a separate, intentional sessionStorage side-table
    // (SESSION_STORAGE_KEY) for its own per-session dedup; that is a deliberate
    // architectural addition, so the KAN-5 session's localStorage home is what
    // this test pins rather than a blanket ban on sessionStorage.
    touchSession();

    expect(readPersisted().sessionId).toEqual(expect.any(String));
  });

  test('degrades to memory rather than throwing when storage is unavailable', () => {
    const getItem = jest.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const setItem = jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => track('accounts_view_opened', { existing_account_count: 0 })).not.toThrow();
    expect(getTrackedEventsForTest()).toHaveLength(1);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('entry source resolution', () => {
  test('classifies a cold direct hit as direct_url', () => {
    expect(resolveEntrySource('PUSH')).toBe('direct_url');
  });

  test('a POP after in-app navigation is browser_history, not direct_url', () => {
    noteInAppNavigation();

    expect(resolveEntrySource('POP')).toBe('browser_history');
  });

  test('a PUSH after in-app navigation is in_app_nav', () => {
    noteInAppNavigation();

    expect(resolveEntrySource('PUSH')).toBe('in_app_nav');
  });

  test('falls back to navigation timing when the app has not navigated yet', () => {
    const restore = stubNavigationEntries(() => [{ type: 'reload' }]);

    expect(resolveEntrySource('POP')).toBe('reload');

    stubNavigationEntries(() => [{ type: 'back_forward' }]);
    expect(resolveEntrySource('POP')).toBe('browser_history');

    stubNavigationEntries(() => []);
    expect(resolveEntrySource('POP')).toBe('direct_url');

    restore();
  });

  test('a throwing navigation-timing lookup still resolves rather than breaking the view', () => {
    const restore = stubNavigationEntries(() => {
      throw new Error('unsupported');
    });

    expect(resolveEntrySource('PUSH')).toBe('direct_url');

    restore();
  });

  // jsdom ships no navigation timing entry at all, so this is the real
  // environment for the guard rather than a hypothetical one.
  test('an absent navigation timing API resolves to direct_url instead of throwing', () => {
    expect(window.performance.getEntriesByType).toBeUndefined();
    expect(() => resolveEntrySource('PUSH')).not.toThrow();
    expect(resolveEntrySource('PUSH')).toBe('direct_url');
  });

  test('only ever returns one of the four documented sources', () => {
    const allowed = ['in_app_nav', 'browser_history', 'reload', 'direct_url'];

    ['PUSH', 'POP', 'REPLACE', undefined].forEach((type) => {
      expect(allowed).toContain(resolveEntrySource(type));
    });

    noteInAppNavigation();

    ['PUSH', 'POP', 'REPLACE', undefined].forEach((type) => {
      expect(allowed).toContain(resolveEntrySource(type));
    });
  });
});

describe('session window', () => {
  test('is a 30-minute inactivity window', () => {
    expect(SESSION_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  test('the first touch opens session 1', () => {
    expect(touchSession().sessionCount).toBe(1);
  });

  test('activity inside the window keeps the same session', () => {
    const first = touchSession();

    writePersisted({ lastActivityAt: Date.now() - (SESSION_TIMEOUT_MS - 1000) });

    const second = touchSession();

    expect(second.sessionId).toBe(first.sessionId);
    expect(second.sessionCount).toBe(1);
  });

  test('a gap longer than the window mints a new session and increments the counter', () => {
    const first = touchSession();

    writePersisted({ lastActivityAt: Date.now() - (SESSION_TIMEOUT_MS + 1000) });

    const second = touchSession();

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.sessionCount).toBe(2);
    expect(getSessionInfo().sessionCount).toBe(2);
  });
});

describe('identifier and address safety', () => {
  test('hashes identifiers one-way and stably', () => {
    expect(hashAccountId('acct_abc')).toMatch(/^acct_[0-9a-z]+$/);
    expect(hashAccountId('acct_abc')).toBe(hashAccountId('acct_abc'));
    expect(hashAccountId('acct_abc')).not.toBe(hashAccountId('acct_abd'));
    expect(hashAccountId('acct_abc')).not.toContain('abc');
    expect(hashAccountId(null)).toBeNull();
    expect(hashAccountId(undefined)).toBeNull();
  });

  test('track hashes every identifier property at the emit boundary', () => {
    track('account_activated', {
      account_id: ADDR,
      previous_active_account_id: 'acct_previous',
      account_count: 2,
      was_auto_selected: false,
    });

    const [event] = getTrackedEventsForTest();

    expect(event.properties.account_id).toBe(hashAccountId(ADDR));
    expect(event.properties.previous_active_account_id).toBe(hashAccountId('acct_previous'));
    expect(JSON.stringify(event)).not.toContain(ADDR);
    expect(event.properties.account_count).toBe(2);
  });

  test('a null identifier stays null instead of hashing to a bucket', () => {
    track('account_activated', { account_id: 'acct_x', previous_active_account_id: null });

    expect(getTrackedEventsForTest()[0].properties.previous_active_account_id).toBeNull();
  });

  test('classifies address shape without echoing the address', () => {
    expect(classifyAddressFormat(ADDR)).toBe('evm_hex_42');
    expect(classifyAddressFormat(ADDR.slice(2))).toBe('evm_hex_40_no_prefix');
    expect(classifyAddressFormat('0x123')).toBe('too_short');
    expect(classifyAddressFormat(`${ADDR}11`)).toBe('too_long');
    expect(classifyAddressFormat('0xnothexatall')).toBe('non_hex');
    expect(classifyAddressFormat('   ')).toBe('empty');
    expect(classifyAddressFormat('')).toBe('empty');
    expect(classifyAddressFormat(undefined)).toBe('empty');
  });
});

describe('account age and retention', () => {
  test('an account that predates instrumentation reports a null age, not zero', () => {
    notePreexistingAccounts(['acct_old']);

    expect(getAccountAgeDays('acct_old')).toBeNull();
    expect(getRetentionContext()).toEqual({
      isReturning: false,
      daysSinceFirstAccount: null,
      sessionsSinceFirstAccount: null,
    });
  });

  test('an observed account reports its age in whole days', () => {
    touchSession();
    noteAccountFirstSeen('acct_new', Date.now() - 3 * DAY_MS);

    expect(getAccountAgeDays('acct_new')).toBe(3);
  });

  test('a later session marks the visitor as returning', () => {
    touchSession();
    noteAccountFirstSeen('acct_new', Date.now() - 2 * DAY_MS);

    expect(getRetentionContext().isReturning).toBe(false);

    writePersisted({ lastActivityAt: Date.now() - (SESSION_TIMEOUT_MS + 1000) });
    touchSession();

    const retention = getRetentionContext();

    expect(retention.isReturning).toBe(true);
    expect(retention.sessionsSinceFirstAccount).toBe(1);
    expect(retention.daysSinceFirstAccount).toBe(2);
  });
});

describe('sink and flush seam', () => {
  test('configureAnalytics swaps both the sink and the flush', async () => {
    const sink = jest.fn();
    const flush = jest.fn(() => Promise.resolve('flushed'));

    configureAnalytics({ sink, flush });

    track('trade_link_clicked', { source: 'navbar' });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toMatchObject({ event: 'trade_link_clicked' });
    await expect(flushAnalytics()).resolves.toBe('flushed');
    expect(flush).toHaveBeenCalledTimes(1);
  });

  test('the default flush resolves so callers can always await it', async () => {
    await expect(flushAnalytics()).resolves.toBeUndefined();
  });

  test('a throwing sink never takes the view down with it', () => {
    configureAnalytics({
      sink: () => {
        throw new Error('sink exploded');
      },
    });

    expect(() => track('accounts_view_opened', {})).not.toThrow();
  });

  test('pagehide flushes the configured sink', () => {
    const flush = jest.fn(() => Promise.resolve());

    configureAnalytics({ flush });

    window.dispatchEvent(new Event('pagehide'));

    expect(flush).toHaveBeenCalledTimes(1);
  });

  test('registers the pagehide listener in the module body', () => {
    expect(source).toMatch(/addEventListener\(\s*'pagehide'/);
    expect(source).toMatch(/'pagehide'[\s\S]{0,120}flushAnalytics\(\)/);
  });

  test('the default buffer is bounded', () => {
    for (let i = 0; i < 250; i += 1) {
      track('accounts_view_opened', { existing_account_count: i });
    }

    const buffered = getTrackedEventsForTest();

    expect(buffered).toHaveLength(200);
    expect(buffered[buffered.length - 1].properties.existing_account_count).toBe(249);
  });
});

describe('page-level sink forwarding', () => {
  afterEach(() => {
    delete window.analytics;
    delete window.track;
    delete window.dataLayer;
  });

  test('forwards the event name and hashed properties to window.analytics.track', () => {
    const calls = [];
    window.analytics = { track: (name, props) => calls.push([name, props]) };

    track('account_added', { account_id: 'acct-raw-1', address_format: 'evm_hex_42' });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('account_added');
    expect(calls[0][1].address_format).toBe('evm_hex_42');
    expect(calls[0][1].account_id).toBe(hashAccountId('acct-raw-1'));
    expect(calls[0][1].account_id).not.toBe('acct-raw-1');
  });

  test('forwards to a bare window.track sink', () => {
    const calls = [];
    window.track = (name, props) => calls.push([name, props]);

    track('accounts_view_opened', { existing_account_count: 2 });

    expect(calls).toEqual([['accounts_view_opened', { existing_account_count: 2 }]]);
  });

  test('pushes a dataLayer payload carrying the event name', () => {
    window.dataLayer = [];

    track('accounts_view_opened', { existing_account_count: 0 });

    expect(window.dataLayer).toEqual([
      { event: 'accounts_view_opened', existing_account_count: 0 }
    ]);
  });

  test('a throwing page sink neither breaks track() nor the buffered copy', () => {
    const calls = [];
    window.analytics = {
      track: () => {
        throw new Error('vendor blew up');
      }
    };
    window.track = (name) => calls.push(name);

    expect(() => track('accounts_view_opened', {})).not.toThrow();
    expect(calls).toEqual(['accounts_view_opened']);
    expect(getTrackedEventsForTest()).toHaveLength(1);
  });

  test('an explicitly configured sink replaces the page-level hand-off', () => {
    const calls = [];
    const sink = jest.fn();
    window.analytics = { track: (name) => calls.push(name) };

    configureAnalytics({ sink });
    track('accounts_view_opened', {});

    expect(sink).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });
});

describe('test teardown seam', () => {
  test('resetAnalyticsForTest clears the flag, the buffer and the stored key', () => {
    noteInAppNavigation();
    track('accounts_view_opened', {});

    expect(getTrackedEventsForTest()).toHaveLength(1);
    expect(window.localStorage.getItem(ANALYTICS_KEY)).not.toBeNull();

    resetAnalyticsForTest();

    expect(getTrackedEventsForTest()).toHaveLength(0);
    expect(window.localStorage.getItem(ANALYTICS_KEY)).toBeNull();
    expect(resolveEntrySource('PUSH')).toBe('direct_url');
  });
});
