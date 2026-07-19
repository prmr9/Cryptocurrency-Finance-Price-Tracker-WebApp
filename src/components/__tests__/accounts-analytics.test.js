/**
 * KAN-5 regression: the KAN-4 wallet-account onboarding flow must emit the
 * approved activation analytics events, and those events must never carry raw
 * wallet material (address or user-supplied label) in their properties.
 *
 * The instrumentation lives in src/services/analytics.js and its call sites in
 * src/components/Accounts.js. These assertions pin the emitted events rather
 * than the call sites, so any conforming wiring passes -- including the no-PII
 * assertion, which is the regression net for the privacy rule.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Vendor-neutral capture. analytics.js dispatches every event through a
// swappable sink, so the capture is installed there (see beforeEach) instead of
// mocking the module: a `virtual: true` jest.mock registers only for this file's
// resolution context and never intercepts the import Accounts.js resolves for
// itself, so the component would keep writing into the real internal buffer.
import { configureAnalytics } from '../../services/analytics';
import Accounts from '../Accounts';

function mockRecorder() {
  if (!global.__ANALYTICS_EVENTS__) {
    global.__ANALYTICS_EVENTS__ = [];
  }
  return global.__ANALYTICS_EVENTS__;
}

function mockTrack(name, props) {
  mockRecorder().push({ name: name, props: props || {} });
}

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
    // Capture at the real module's sink boundary. setupTests.js restores the
    // default sink after every test, so this must be re-installed per test.
    configureAnalytics({ sink: (event) => mockTrack(event.event, event.properties) });
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

    // add_account_submitted must describe the input, not carry it. The shape
    // enum is what describes it: a raw address_length is a near-constant 42 for
    // EVM and accounts-instrumentation.test.js asserts it never reaches a sink.
    const submitted = eventNamed('add_account_submitted');
    expect(submitted.props).toHaveProperty('address_format');
    expect(submitted.props.address_format).toBe('evm_hex_42');
    expect(submitted.props).toHaveProperty('label_provided');
    expect(submitted.props.label_provided).toBe(true);

    // The account identifier must be a synthetic id, not the wallet address.
    const added = eventNamed('account_added');
    expect(String(added.props.account_id)).not.toBe(WALLET_ADDRESS);
  });
});
