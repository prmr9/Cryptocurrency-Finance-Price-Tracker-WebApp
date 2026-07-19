/**
 * KAN-5: the onboarding funnel emits its events from the real KAN-4 surfaces.
 *
 * These assert on emitted events rather than on call sites, so any conforming
 * wiring passes — and they are the regression net for the privacy rule that no
 * raw address or raw account id can reach the sink.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Accounts from '../Accounts';
import { getTrackedEventsForTest, hashAccountId } from '../../services/analytics';

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';

const renderAccounts = () =>
  render(
    <MemoryRouter>
      <Accounts />
    </MemoryRouter>
  );

const eventsNamed = (name) => getTrackedEventsForTest().filter((e) => e.event === name);

const addAccountViaForm = async (label, address) => {
  userEvent.clear(screen.getByLabelText(/label/i));
  userEvent.type(screen.getByLabelText(/label/i), label);
  userEvent.clear(screen.getByLabelText(/public wallet address/i));
  userEvent.type(screen.getByLabelText(/public wallet address/i), address);
  const submit = screen.getByRole('button', { name: /add account/i });
  userEvent.click(submit);
  await waitFor(() => expect(submit).toBeEnabled());
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('accounts funnel instrumentation', () => {
  test('opening the view emits accounts_view_opened with entry context', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    const [opened] = eventsNamed('accounts_view_opened');

    expect(opened).toBeDefined();
    expect(opened.properties).toMatchObject({
      existing_account_count: 0,
      is_first_visit: true,
    });
    expect(['in_app_nav', 'browser_history', 'reload', 'direct_url']).toContain(
      opened.properties.entry_source
    );
  });

  test('a successful add emits submitted, added and an auto-select activation', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Main wallet', ADDR_A);
    await screen.findByText('Main wallet');

    const [submitted] = eventsNamed('add_account_submitted');
    expect(submitted.properties).toMatchObject({
      label_provided: true,
      address_format: 'evm_hex_42',
      existing_account_count: 0,
    });

    const [added] = eventsNamed('account_added');
    expect(added.properties).toMatchObject({
      account_count_after: 1,
      is_first_account: true,
      attempts_before_success: 0,
    });
    expect(added.properties.account_id).toMatch(/^acct_/);
    expect(typeof added.properties.time_to_add_ms).toBe('number');

    const [activated] = eventsNamed('account_activated');
    expect(activated.properties).toMatchObject({
      was_auto_selected: true,
      previous_active_account_id: null,
      account_count: 1,
    });
  });

  test('no raw address and no raw account id ever reaches the sink', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Main wallet', ADDR_A);
    await screen.findByText('Main wallet');

    userEvent.click(screen.getByRole('link', { name: /trade/i }));

    const serialized = JSON.stringify(getTrackedEventsForTest());

    expect(serialized).not.toContain(ADDR_A);
    expect(serialized).not.toMatch(/address_length/);
    // the store's own ids are hashed too, so the sink cannot be joined back to it
    expect(serialized).not.toMatch(/"account_id":"acct_[a-z0-9]+_\d+"/);
  });

  test('an invalid address emits a coded validation failure with the attempt number', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Bad wallet', '0xnothex');
    await screen.findByRole('alert');

    const [failed] = eventsNamed('add_account_validation_failed');

    expect(failed.properties).toMatchObject({
      error_code: 'address_invalid',
      field: 'address',
      attempt_number: 1,
    });
    expect(failed.properties.error_message).toMatch(/valid public wallet address/i);
    expect(eventsNamed('account_added')).toHaveLength(0);
  });

  test('a retry after a failure reports attempts_before_success', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Retry wallet', '0xnothex');
    await screen.findByRole('alert');
    await addAccountViaForm('Retry wallet', ADDR_A);
    await screen.findByText('Retry wallet');

    const [added] = eventsNamed('account_added');

    expect(added.properties.attempts_before_success).toBe(1);
    expect(eventsNamed('add_account_submitted')).toHaveLength(2);
  });

  test('a duplicate address is reported with its own error code', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Main wallet', ADDR_A);
    await screen.findByText('Main wallet');
    await addAccountViaForm('Same again', ADDR_A);
    await screen.findByRole('alert');

    const [failed] = eventsNamed('add_account_validation_failed');

    expect(failed.properties.error_code).toBe('address_duplicate');
    expect(failed.properties.field).toBe('address');
  });

  test('selecting another account emits a non-auto activation carrying the previous id', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('First', ADDR_A);
    await screen.findByText('First');
    await addAccountViaForm('Second', ADDR_B);
    await screen.findByText('Second');

    const rows = screen.getAllByRole('listitem');
    userEvent.click(within(rows[1]).getByRole('button', { name: /set active/i }));

    await waitFor(() => expect(eventsNamed('account_activated')).toHaveLength(2));

    const manual = eventsNamed('account_activated')[1];

    expect(manual.properties.was_auto_selected).toBe(false);
    expect(manual.properties.account_count).toBe(2);
    expect(manual.properties.previous_active_account_id).toMatch(/^acct_/);
    expect(manual.properties.previous_active_account_id).not.toBe(manual.properties.account_id);
  });

  test('removing an account reports whether it was active and how old it was', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Only', ADDR_A);
    await screen.findByText('Only');

    userEvent.click(screen.getByRole('button', { name: /remove account only/i }));
    await screen.findByText(/no accounts yet/i);

    const [removed] = eventsNamed('account_removed');

    expect(removed.properties).toMatchObject({
      account_count_after: 0,
      was_active: true,
      account_age_days: 0,
    });
  });

  test('a per-account Trade click is attributed to the row it came from', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Main wallet', ADDR_A);
    await screen.findByText('Main wallet');

    userEvent.click(screen.getByRole('link', { name: /trade/i }));

    const [clicked] = eventsNamed('trade_link_clicked');

    expect(clicked.properties).toMatchObject({
      source: 'account_row',
      account_count: 1,
    });
    expect(clicked.properties.destination_url).toMatch(/^https:\/\/app\.uniswap\.org\/explore/);
    expect(clicked.properties.account_id).toMatch(/^acct_/);

    const [added] = eventsNamed('account_added');
    expect(clicked.properties.account_id).toBe(added.properties.account_id);
  });

  test('an account created before instrumentation reports a null age, not zero', async () => {
    window.localStorage.setItem(
      'coinsearch.accounts.v1',
      JSON.stringify({
        version: 1,
        accounts: [
          { id: 'acct_legacy', label: 'Legacy', address: ADDR_A, chainId: 1, createdAt: '' },
        ],
        activeAccountId: 'acct_legacy',
      })
    );

    renderAccounts();
    await screen.findByText('Legacy');

    userEvent.click(screen.getByRole('button', { name: /remove account legacy/i }));
    await screen.findByText(/no accounts yet/i);

    const [removed] = eventsNamed('account_removed');

    expect(removed.properties.account_age_days).toBeNull();
    expect(removed.properties.account_id).toBe(hashAccountId('acct_legacy'));
  });
});
