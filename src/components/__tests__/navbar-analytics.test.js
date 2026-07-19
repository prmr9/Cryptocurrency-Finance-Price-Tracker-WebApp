import fs from 'fs';
import path from 'path';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';

const NAVBAR_PATH = path.resolve(__dirname, '..', 'Navbar.js');
const source = fs.readFileSync(NAVBAR_PATH, 'utf8');

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

const emitted = () => window.__ANALYTICS_EVENTS__ || [];

const eventsNamed = (name) => emitted().filter((e) => e.event === name);

const tradeLink = () => screen.getByRole('link', { name: /trade/i });

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  fireEvent(document, new Event('visibilitychange'));
};

describe('Navbar analytics', () => {
  describe('navbar_trade_link_viewed', () => {
    test('does not fire before the anchor enters the viewport', () => {
      renderNavbar();

      expect(eventsNamed('navbar_trade_link_viewed')).toHaveLength(0);
    });

    test('fires once when the anchor becomes visible', () => {
      renderNavbar();

      global.__triggerIntersection(true);

      const viewed = eventsNamed('navbar_trade_link_viewed');

      expect(viewed).toHaveLength(1);
      expect(viewed[0]).toMatchObject({ page_path: '/' });
      expect(typeof viewed[0].viewport_width).toBe('number');
    });

    test('does not fire when the anchor is reported as not intersecting', () => {
      renderNavbar();

      global.__triggerIntersection(false);

      expect(eventsNamed('navbar_trade_link_viewed')).toHaveLength(0);
    });

    test('fires only once across a remount within the same session', () => {
      const { unmount } = renderNavbar();
      global.__triggerIntersection(true);
      unmount();

      renderNavbar();
      global.__triggerIntersection(true);

      expect(eventsNamed('navbar_trade_link_viewed')).toHaveLength(1);
    });
  });

  describe('navbar_trade_link_clicked', () => {
    test('fires on a mouse click with the link properties attached', () => {
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });

      const clicks = eventsNamed('navbar_trade_link_clicked');

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatchObject({
        trade_url: 'https://app.uniswap.org',
        link_target: '_blank',
        activation_method: 'mouse_click',
        page_path: '/',
      });
      expect(typeof clicks[0].seconds_since_page_load).toBe('number');
    });

    test('reports keyboard activation distinctly from a mouse click', () => {
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 0 });

      expect(eventsNamed('navbar_trade_link_clicked')[0].activation_method).toBe(
        'keyboard'
      );
    });

    test('reports a middle-click via auxclick', () => {
      renderNavbar();

      fireEvent(
        tradeLink(),
        new MouseEvent('auxclick', { bubbles: true, button: 1 })
      );

      expect(eventsNamed('navbar_trade_link_clicked')[0].activation_method).toBe(
        'middle_click'
      );
    });

    test('emits exactly once per activation, not once per listener', () => {
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });

      expect(eventsNamed('navbar_trade_link_clicked')).toHaveLength(1);
    });

    test('ignores clicks elsewhere in the navbar', () => {
      renderNavbar();

      fireEvent.click(screen.getByRole('heading', { level: 1 }));

      expect(eventsNamed('navbar_trade_link_clicked')).toHaveLength(0);
    });

    test('carries no account identifier and no auth-state flag', () => {
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });

      const payload = eventsNamed('navbar_trade_link_clicked')[0];

      expect('user_id' in payload).toBe(false);
      expect('is_authenticated' in payload).toBe(false);
    });
  });

  describe('trade_link_repeat_used', () => {
    // A first-ever click is never a repeat, so the retention event can only be
    // observed with a pre-existing click history from an earlier day. Seeding
    // localStorage directly is how a returning user's browser actually looks.
    const seedFirstClickDay = (day) =>
      window.localStorage.setItem(
        'kan2.trade_click_history',
        JSON.stringify({
          first_day: day,
          click_count: 3,
          days: [day],
          reported_days: [],
        })
      );

    test('does not fire on a first-ever click', () => {
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });

      expect(eventsNamed('navbar_trade_link_clicked')).toHaveLength(1);
      expect(eventsNamed('trade_link_repeat_used')).toHaveLength(0);
    });

    test('fires with the retention payload when the first click was an earlier day', () => {
      seedFirstClickDay('2000-01-01');
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });

      const repeats = eventsNamed('trade_link_repeat_used');

      expect(repeats).toHaveLength(1);
      expect(repeats[0]).toMatchObject({
        click_count_lifetime: 4,
        distinct_days_used: 2,
        page_path: '/',
      });
      expect(repeats[0].days_since_first_trade_click).toBeGreaterThan(0);
    });

    test('fires at most once per day however many times the link is clicked', () => {
      seedFirstClickDay('2000-01-01');
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });
      fireEvent.click(tradeLink(), { detail: 1 });

      expect(eventsNamed('navbar_trade_link_clicked')).toHaveLength(2);
      expect(eventsNamed('trade_link_repeat_used')).toHaveLength(1);
    });

    test('carries no account identifier and no auth-state flag', () => {
      seedFirstClickDay('2000-01-01');
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });

      const payload = eventsNamed('trade_link_repeat_used')[0];

      expect('user_id' in payload).toBe(false);
      expect('is_authenticated' in payload).toBe(false);
    });
  });

  describe('trade_link_returned_to_app', () => {
    test('fires when the tab regains focus after a click', () => {
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });
      setVisibility('visible');

      const returns = eventsNamed('trade_link_returned_to_app');

      expect(returns).toHaveLength(1);
      expect(returns[0].seconds_away).toBeGreaterThanOrEqual(0);
    });

    test('does not fire without a preceding click', () => {
      renderNavbar();

      setVisibility('visible');

      expect(eventsNamed('trade_link_returned_to_app')).toHaveLength(0);
    });

    test('fires at most once per click', () => {
      renderNavbar();

      fireEvent.click(tradeLink(), { detail: 1 });
      setVisibility('hidden');
      setVisibility('visible');
      setVisibility('visible');

      expect(eventsNamed('trade_link_returned_to_app')).toHaveLength(1);
    });

    test('is not armed by a background-opening middle-click', () => {
      renderNavbar();

      fireEvent(
        tradeLink(),
        new MouseEvent('auxclick', { bubbles: true, button: 1 })
      );
      setVisibility('visible');

      expect(eventsNamed('trade_link_returned_to_app')).toHaveLength(0);
    });
  });

  describe('source-level guarantees', () => {
    test('the trade anchor carries no onClick prop', () => {
      expect(source).not.toMatch(/onClick/);
    });

    test('the anchor keeps its KAN-1 href, target and rel', () => {
      renderNavbar();

      expect(tradeLink()).toHaveAttribute('href', 'https://app.uniswap.org');
      expect(tradeLink()).toHaveAttribute('target', '_blank');
      expect(tradeLink()).toHaveAttribute('rel', 'noopener noreferrer');
      expect(source).toContain('href={TRADE_URL}');
      expect(source).toContain("target='_blank'");
      expect(source).toContain("rel='noopener noreferrer'");
    });

    test('carries no account identifier or auth-state field', () => {
      expect(source).not.toContain('user_id');
      expect(source).not.toContain('is_authenticated');
    });
  });
});
