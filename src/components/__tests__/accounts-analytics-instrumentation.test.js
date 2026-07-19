import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { track } from '../../services/analytics';
import Accounts from '../Accounts';

// KAN-5 regression: the accounts onboarding flow shipped in KAN-4 emits none of the
// approved analytics events. These tests drive the real /accounts view and assert the
// activation funnel (accounts_view_opened -> add_account_submitted -> account_added ->
// account_activated) actually reaches the analytics facade.
//
// src/services/analytics.js now exists, so this is a plain (non-virtual) module
// mock. A virtual mock on a module that physically exists registers against the
// resolved path nondeterministically once a worker is reused, which let
// Accounts.js resolve the real module and left track.mock.calls empty under
// parallel runs. The call is hoisted above the imports by babel-plugin-jest-hoist,
// so the factory is registered before the analytics module is required.
jest.mock('../../services/analytics', () => ({
  __esModule: true,
  track: jest.fn(),
  default: { track: jest.fn() },
}));

const VALID_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

function callsFor(eventName) {
  return track.mock.calls.filter(([name]) => name === eventName);
}

function firstPayload(eventName) {
  const call = callsFor(eventName)[0];
  return (call && call[1]) || {};
}

function trackedEventNames() {
  return track.mock.calls.map(([name]) => name);
}

function findField(pattern) {
  const byLabel = screen.queryAllByLabelText(pattern, { selector: 'input, textarea' });
  if (byLabel.length > 0) return byLabel[0];

  const byPlaceholder = screen.queryAllByPlaceholderText(pattern);
  return byPlaceholder[0] || null;
}

function findSubmitControl() {
  const controls = screen.queryAllByRole('button', { name: /add|save|create/i });
  return controls[0] || null;
}

function submitAddAccountForm({ label, address }) {
  const addressField = findField(/address/i);
  expect(addressField).not.toBeNull();
  fireEvent.change(addressField, { target: { value: address } });

  if (label) {
    const labelField = findField(/label|name|nickname/i);
    if (labelField && labelField !== addressField) {
      fireEvent.change(labelField, { target: { value: label } });
    }
  }

  const submit = findSubmitControl();
  expect(submit).not.toBeNull();
  fireEvent.click(submit);
}

function renderAccountsRoute() {
  return render(
    <MemoryRouter initialEntries={['/accounts']}>
      <Routes>
        <Route path="/accounts" element={<Accounts />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('KAN-5: accounts onboarding analytics instrumentation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    if (window.sessionStorage) window.sessionStorage.clear();
    track.mockClear();
  });

  it('emits accounts_view_opened when the /accounts route mounts', async () => {
    renderAccountsRoute();

    await waitFor(() => {
      expect(callsFor('accounts_view_opened').length).toBeGreaterThan(0);
    });

    const payload = firstPayload('accounts_view_opened');
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(['entry_source', 'existing_account_count', 'is_first_visit'])
    );
    expect(payload.existing_account_count).toBe(0);
    expect(payload.is_first_visit).toBe(true);
  });

  it('emits add_account_submitted when the add-account form is submitted', async () => {
    renderAccountsRoute();

    await waitFor(() => {
      expect(findField(/address/i)).not.toBeNull();
    });

    submitAddAccountForm({ label: 'Cold storage', address: VALID_ADDRESS });

    await waitFor(() => {
      expect(callsFor('add_account_submitted').length).toBeGreaterThan(0);
    });

    const payload = firstPayload('add_account_submitted');
    // The ticket's raw plan carried address_length; the approved implementation
    // plan replaced it with the address_format shape enum, because a length is a
    // near-constant 42 for EVM (no signal) and is still address-derived. The
    // emitter drops address_length at the emit boundary, so asserting its
    // absence here is what keeps the raw value from creeping back in.
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(['label_provided', 'address_format', 'existing_account_count'])
    );
    expect(payload.address_format).toBe('evm_hex_42');
    expect(payload).not.toHaveProperty('address_length');
    expect(payload.existing_account_count).toBe(0);
  });

  it('emits account_added and account_activated for the first persisted account', async () => {
    renderAccountsRoute();

    await waitFor(() => {
      expect(findField(/address/i)).not.toBeNull();
    });

    submitAddAccountForm({ label: 'Cold storage', address: VALID_ADDRESS });

    // The account must actually persist — guard against asserting on a rejected submit.
    await waitFor(() => {
      expect(callsFor('account_added').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const added = firstPayload('account_added');
    expect(Object.keys(added)).toEqual(
      expect.arrayContaining([
        'account_id',
        'account_count_after',
        'is_first_account',
        'attempts_before_success',
        'time_to_add_ms',
      ])
    );
    expect(added.account_count_after).toBe(1);
    expect(added.is_first_account).toBe(true);
    expect(added.account_id).toBeTruthy();

    // First account auto-selects, so activation must be reported as well.
    await waitFor(() => {
      expect(callsFor('account_activated').length).toBeGreaterThan(0);
    });

    const activated = firstPayload('account_activated');
    expect(Object.keys(activated)).toEqual(
      expect.arrayContaining([
        'account_id',
        'account_count',
        'was_auto_selected',
        'previous_active_account_id',
      ])
    );
    expect(activated.was_auto_selected).toBe(true);
    expect(activated.account_id).toBe(added.account_id);
    expect(activated.previous_active_account_id).toBeNull();

    // Ordering: the funnel must be reported in the order the user experiences it.
    const names = trackedEventNames();
    expect(names.indexOf('accounts_view_opened')).toBeLessThan(
      names.indexOf('add_account_submitted')
    );
    expect(names.indexOf('add_account_submitted')).toBeLessThan(names.indexOf('account_added'));
  });

  it('emits add_account_validation_failed when an invalid address is rejected', async () => {
    renderAccountsRoute();

    await waitFor(() => {
      expect(findField(/address/i)).not.toBeNull();
    });

    submitAddAccountForm({ label: 'Bad one', address: 'not-an-address' });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(callsFor('add_account_validation_failed').length).toBeGreaterThan(0);

    const payload = firstPayload('add_account_validation_failed');
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(['error_code', 'error_message', 'field', 'attempt_number'])
    );
    expect(payload.attempt_number).toBe(1);
    expect(callsFor('account_added')).toHaveLength(0);
  });
});
