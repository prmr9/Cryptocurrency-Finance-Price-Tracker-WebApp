import '@testing-library/jest-dom';
import { resetAnalyticsForTest } from './services/analytics';

// The first shared test lifecycle hook in this repo. Analytics holds module-level
// state (the in-app-navigation flag, the configured sink, the event buffer) on
// top of its localStorage key, so without this teardown one test's telemetry
// leaks into the next test's assertions.
afterEach(() => {
  window.localStorage.clear();
  resetAnalyticsForTest();
});
