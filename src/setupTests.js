import '@testing-library/jest-dom';
import { __resetAnalyticsForTests } from './analytics';

// jsdom implements neither IntersectionObserver nor sendBeacon, and both are
// load-bearing for the KAN-2 analytics assertions. The fakes below are
// deliberately controllable: tests decide when an element "becomes visible"
// via __triggerIntersection(), rather than the observer firing on its own.

class TestIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.elements = [];
    TestIntersectionObserver.instances.push(this);
  }

  observe(element) {
    this.elements.push(element);
  }

  unobserve(element) {
    this.elements = this.elements.filter((candidate) => candidate !== element);
  }

  disconnect() {
    this.elements = [];
  }

  // Test hook: report every observed element as intersecting (or not).
  trigger(isIntersecting = true) {
    this.callback(
      this.elements.map((target) => ({ target, isIntersecting })),
      this
    );
  }
}

TestIntersectionObserver.instances = [];

global.IntersectionObserver = TestIntersectionObserver;

global.__intersectionObservers = () => TestIntersectionObserver.instances;

global.__triggerIntersection = (isIntersecting = true) => {
  TestIntersectionObserver.instances.forEach((observer) =>
    observer.trigger(isIntersecting)
  );
};

Object.defineProperty(window.navigator, 'sendBeacon', {
  configurable: true,
  writable: true,
  value: jest.fn(() => true),
});

beforeEach(() => {
  TestIntersectionObserver.instances.length = 0;

  window.navigator.sendBeacon.mockClear();
  delete window.__ANALYTICS_EVENTS__;
  delete process.env.REACT_APP_ANALYTICS_ENDPOINT;

  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch (error) {
    console.log(error);
  }

  __resetAnalyticsForTests();
});
