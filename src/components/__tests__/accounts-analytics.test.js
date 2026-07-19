/**
 * KAN-5 regression: the KAN-4 wallet-account onboarding flow must emit the
 * approved activation analytics events, and those events must never carry raw
 * wallet material (address or user-supplied label) in their properties.
 *
 * On the current (uninstrumented) code no events are emitted at all, so the
 * positive assertions below fail. Once the instrumentation from the analytics
 * plan is added, all assertions -- including the no-PII assertion -- pass.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Vendor-neutral capture. Virtual mocks are registered for the candidate
// analytics module paths so this works whether or not the module exists yet.
// Hoisting-safe: only hoisted function declarations are referenced here.
function mockRecorder() {
  if (!global.__ANALYTICS_EVENTS__) {
    global.__ANALYTICS_EVENTS__ = [];
  }
  return global.__ANALYTICS_EVENTS__;
}

function mockTrack(name, props) {
  mockRecorder().push({ name: name, props: props || {} });
}

function mockAnalyticsModule() {
  return {
    __esModule: true,
    default: mockTrack,
    track: mockTrack,
    trackEvent: mockTrack,
    logEvent: mockTrack,
    capture: mockTrack,
  };
}

jest.mock('../../services/analytics', () => mockAnalyticsModule(), { virtual: true });
jest.mock('../../services/analytics/index', () => mockAnalyticsModule(), { virtual: true });
jest.mock('../../services/track', () => mockAnalyticsModule(), { virtual: true });
jest.mock('../../services/telemetry', () => mockAnalyticsModule(), { virtual: true });
jest.mock('../../analytics', () => mockAnalyticsModule(), { virtual: true });

const Accounts = require('../Accounts').default || require('../Accounts');

const WALLET_ADDRESS = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const ACCOUNT_LABEL = 'QaVaultNicknameZzz';

function events() {
  return mockRecorder();
}

function eventNames() {
  return events().map((e) => e.name);
}

function eventNamed(name) {
  return events().find((e) => e.name === name);
}

function renderAccounts() {
  return render(
    <MemoryRouter initialEntries={['/accounts']}>
      <Accounts />
    </MemoryRouter>
  );
}

function fillAndSubmitAddAccountForm() {
  const labelField = screen.getByLabelText(/^label$/i);
  const addressField = screen.getByLabelText(/address/i);

  expect(addressField).toBeTruthy();

  fireEvent.change(labelField, { target: { value: ACCOUNT_LABEL } });
  fireEvent.change(addressField, { target: { value: WALLET_ADDRESS } });

  fireEvent.click(screen.getByRole('button', { name: /add account/i }));
}

describe('KAN-5 accounts onboarding analytics', () => {
  beforeEach(() => {
    global.__ANALYTICS_EVENTS__ = [];
    window.localStorage.clear();
    // Vendor-neutral global sinks, in case instrumentation dispatches globally
    // rather than through an imported module.
    window.track = mockTrack;
    window.analytics = { track: mockTrack, capture: mockTrack };
    window.dataLayer = {
      push: (payload) => {
        const { event, ...rest } = payload || {};
        mockTrack(event, rest);
      },
    };
  });

  afterEach(() => {
    delete window.track;
    delete window.analytics;
    delete window.dataLayer;
    global.__ANALYTICS_EVENTS__ = [];
  });

  it('emits accounts_view_opened when the /accounts view mounts', async () => {
    renderAccounts();

    await waitFor(() => {
      expect(eventNames()).toContain('accounts_view_opened');
    });

    const opened = eventNamed('accounts_view_opened');
    expect(opened.props).toHaveProperty('existing_account_count');
    expect(opened.props.existing_account_count).toBe(0);
  });

  it('emits add_account_submitted, account_added and account_activated for the first account', async () => {
    renderAccounts();

    await waitFor(() => {
      expect(eventNames()).toContain('accounts_view_opened');
    });

    fillAndSubmitAddAccountForm();

    await waitFor(() => {
      expect(eventNames()).toContain('add_account_submitted');
    });

    await waitFor(() => {
      expect(eventNames()).toContain('account_added');
    });

    const added = eventNamed('account_added');
    expect(added.props).toHaveProperty('account_id');
    expect(added.props.account_id).toBeTruthy();
    expect(added.props.is_first_account).toBe(true);
    expect(added.props.account_count_after).toBe(1);

    await waitFor(() => {
      expect(eventNames()).toContain('account_activated');
    });

    const activated = eventNamed('account_activated');
    expect(activated.props.was_auto_selected).toBe(true);
    expect(activated.props.account_id).toBe(added.props.account_id);
  });

  it('never puts the raw wallet address or the account label into any tracked event', async () => {
    renderAccounts();

    await waitFor(() => {
      expect(eventNames()).toContain('accounts_view_opened');
    });

    fillAndSubmitAddAccountForm();

    // The address/label only reach analytics once the add flow has actually
    // been instrumented, so require the flow's events before asserting no-PII.
    await waitFor(() => {
      expect(eventNames()).toContain('add_account_submitted');
    });
    await waitFor(() => {
      expect(eventNames()).toContain('account_added');
    });

    const serialized = JSON.stringify(events());

    expect(serialized).not.toContain(WALLET_ADDRESS);
    expect(serialized).not.toContain(ACCOUNT_LABEL);

    // add_account_submitted must describe the input, not carry it.
    const submitted = eventNamed('add_account_submitted');
    expect(submitted.props).toHaveProperty('address_length');
    expect(submitted.props.address_length).toBe(WALLET_ADDRESS.length);
    expect(submitted.props).toHaveProperty('label_provided');
    expect(submitted.props.label_provided).toBe(true);

    // The account identifier must be a synthetic id, not the wallet address.
    const added = eventNamed('account_added');
    expect(String(added.props.account_id)).not.toBe(WALLET_ADDRESS);
  });
});
