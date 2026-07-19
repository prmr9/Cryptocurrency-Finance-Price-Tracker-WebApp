import fs from 'fs';
import path from 'path';
import {
  ANON_ID_KEY,
  baseProps,
  getAnonId,
  getSessionId,
  recordTradeClickDay,
  setSink,
  track,
  trackOnce,
} from './analytics';

const ANALYTICS_PATH = path.resolve(__dirname, 'analytics.js');
const source = fs.readFileSync(ANALYTICS_PATH, 'utf8');

const emitted = () => window.__ANALYTICS_EVENTS__ || [];

describe('analytics emitter seam', () => {
  describe('default sink with no endpoint configured', () => {
    test('parks exactly one payload on window and never calls sendBeacon', () => {
      track('navbar_trade_link_clicked', { activation_method: 'mouse_click' });

      expect(emitted()).toHaveLength(1);
      expect(emitted()[0]).toMatchObject({
        event: 'navbar_trade_link_clicked',
        activation_method: 'mouse_click',
      });
      expect(window.navigator.sendBeacon).not.toHaveBeenCalled();
    });

    test('stamps every payload with an ISO timestamp', () => {
      track('navbar_trade_link_viewed');

      expect(emitted()[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('default sink with an endpoint configured', () => {
    test('calls sendBeacon exactly once with that endpoint', () => {
      process.env.REACT_APP_ANALYTICS_ENDPOINT = 'https://collector.test/e';

      track('navbar_trade_link_clicked');

      expect(window.navigator.sendBeacon).toHaveBeenCalledTimes(1);
      expect(window.navigator.sendBeacon.mock.calls[0][0]).toBe(
        'https://collector.test/e'
      );
      expect(emitted()).toHaveLength(0);
    });
  });

  describe('source-level guarantees', () => {
    test('reads its destination from the environment and hardcodes no URL', () => {
      expect(source).toContain('process.env.REACT_APP_ANALYTICS_ENDPOINT');
      expect(source).not.toMatch(/https?:\/\//);
    });

    test('guards the sendBeacon call on feature detection', () => {
      expect(source).toContain("typeof navigator.sendBeacon === 'function'");
      expect(source).toContain('navigator.sendBeacon(');
    });

    test('imports no third-party analytics package', () => {
      // The emitter is dependency-free: no import statement and no require()
      // call of any kind appears in it, third-party or otherwise.
      expect(source).not.toMatch(/^\s*import\s/m);
      expect(source).not.toMatch(/\brequire\s*\(/);
    });

    test('carries no account identifier or auth-state field', () => {
      expect(source).not.toContain('user_id');
      expect(source).not.toContain('is_authenticated');
    });
  });

  describe('baseProps', () => {
    test('exposes exactly anon_id, session_id, page_path and app_version', () => {
      expect(Object.keys(baseProps()).sort()).toEqual([
        'anon_id',
        'app_version',
        'page_path',
        'session_id',
      ]);
    });

    test('omits any account identifier and any auth-state flag', () => {
      const props = baseProps();

      expect('user_id' in props).toBe(false);
      expect('is_authenticated' in props).toBe(false);
    });

    test('sources its ids from local and session storage', () => {
      const props = baseProps();

      expect(props.anon_id).toBe(window.localStorage.getItem('kan2.anon_id'));
      expect(props.session_id).toBe(
        window.sessionStorage.getItem('kan2.session_id')
      );
    });
  });

  describe('identity', () => {
    test('getAnonId is stable across calls and persists to localStorage', () => {
      const first = getAnonId();

      expect(getAnonId()).toBe(first);
      expect(window.localStorage.getItem(ANON_ID_KEY)).toBe(first);
    });

    test('getSessionId is stable across calls', () => {
      expect(getSessionId()).toBe(getSessionId());
    });
  });

  describe('trackOnce', () => {
    test('emits once for three identical calls and writes the session guard', () => {
      trackOnce('navbar_trade_link_viewed', 'navbar_trade_link_viewed');
      trackOnce('navbar_trade_link_viewed', 'navbar_trade_link_viewed');
      trackOnce('navbar_trade_link_viewed', 'navbar_trade_link_viewed');

      expect(emitted()).toHaveLength(1);
      expect(
        window.sessionStorage.getItem('kan2.once.navbar_trade_link_viewed')
      ).toBe('1');
    });

    test('respects a pre-existing sessionStorage guard from an earlier mount', () => {
      window.sessionStorage.setItem('kan2.once.navbar_trade_link_viewed', '1');

      expect(
        trackOnce('navbar_trade_link_viewed', 'navbar_trade_link_viewed')
      ).toBeNull();
      expect(emitted()).toHaveLength(0);
    });

    test('keys are independent of one another', () => {
      trackOnce('a', 'event_a');
      trackOnce('b', 'event_b');

      expect(emitted().map((e) => e.event)).toEqual(['event_a', 'event_b']);
    });
  });

  describe('recordTradeClickDay', () => {
    test('returns null on the first-ever click', () => {
      expect(recordTradeClickDay(new Date('2026-07-19T10:00:00Z'))).toBeNull();
    });

    test('returns null for a second click on the same day', () => {
      recordTradeClickDay(new Date('2026-07-19T10:00:00Z'));

      expect(recordTradeClickDay(new Date('2026-07-19T18:00:00Z'))).toBeNull();
    });

    test('returns repeat properties on a later day', () => {
      recordTradeClickDay(new Date('2026-07-19T10:00:00Z'));

      expect(recordTradeClickDay(new Date('2026-07-22T09:00:00Z'))).toEqual({
        days_since_first_trade_click: 3,
        click_count_lifetime: 2,
        distinct_days_used: 2,
      });
    });

    test('fires at most once per day', () => {
      recordTradeClickDay(new Date('2026-07-19T10:00:00Z'));
      recordTradeClickDay(new Date('2026-07-20T10:00:00Z'));

      expect(recordTradeClickDay(new Date('2026-07-20T11:00:00Z'))).toBeNull();
    });
  });

  describe('setSink', () => {
    test('routes payloads to a caller-supplied sink', () => {
      const sink = jest.fn();
      setSink(sink);

      track('navbar_trade_link_clicked');

      expect(sink).toHaveBeenCalledTimes(1);
      expect(emitted()).toHaveLength(0);
    });
  });
});
