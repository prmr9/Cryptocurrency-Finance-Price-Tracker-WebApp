import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Accounts from '../Accounts';

const STORAGE_KEY = 'coinsearch.accounts.v1';
const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';

const renderAccounts = () =>
  render(
    <MemoryRouter>
      <Accounts />
    </MemoryRouter>
  );

const addAccountViaForm = async (label, address) => {
  userEvent.clear(screen.getByLabelText(/label/i));
  userEvent.type(screen.getByLabelText(/label/i), label);
  userEvent.clear(screen.getByLabelText(/public wallet address/i));
  userEvent.type(screen.getByLabelText(/public wallet address/i), address);
  const submit = screen.getByRole('button', { name: /add account/i });
  userEvent.click(submit);
  // the store is async and the button is disabled while submitting, so waiting for it
  // to be re-enabled lets the whole promise chain settle before we assert
  await waitFor(() => expect(submit).toBeEnabled());
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('Accounts view', () => {
  test('renders the empty state and a plain-language security notice', async () => {
    renderAccounts();

    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
    expect(screen.getByText(/never enter a private key, seed phrase or password/i)).toBeInTheDocument();
  });

  test('a valid account appears in the list and survives a remount', async () => {
    const { unmount } = renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Main wallet', ADDR_A);

    expect(await screen.findByText('Main wallet')).toBeInTheDocument();
    expect(screen.getByText(ADDR_A)).toBeInTheDocument();

    unmount();
    renderAccounts();

    expect(await screen.findByText('Main wallet')).toBeInTheDocument();
  });

  test('an invalid address shows a role="alert" error and persists nothing', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Bad wallet', '0xnothex');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/valid public wallet address/i);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument();
  });

  test('a duplicate address is rejected with an error', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Main wallet', ADDR_A);
    await screen.findByText('Main wallet');

    await addAccountViaForm('Same wallet again', ADDR_A);

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been added/i);
    expect(screen.queryByText('Same wallet again')).not.toBeInTheDocument();
  });

  test('the first account added is marked active, and a later one can be selected', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('First', ADDR_A);
    await screen.findByText('First');
    await addAccountViaForm('Second', ADDR_B);
    await screen.findByText('Second');

    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText(/^Active$/)).toBeInTheDocument();

    userEvent.click(within(rows[1]).getByRole('button', { name: /set active/i }));

    await waitFor(() => {
      const updated = screen.getAllByRole('listitem');
      expect(within(updated[1]).getByText(/^Active$/)).toBeInTheDocument();
    });
  });

  test('removing the active account promotes the remaining one', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('First', ADDR_A);
    await screen.findByText('First');
    await addAccountViaForm('Second', ADDR_B);
    await screen.findByText('Second');

    userEvent.click(screen.getByRole('button', { name: /remove account first/i }));

    await waitFor(() => expect(screen.queryByText('First')).not.toBeInTheDocument());

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(/^Active$/)).toBeInTheDocument();
  });

  test('removing the only account returns the view to its empty state', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Only', ADDR_A);
    await screen.findByText('Only');

    userEvent.click(screen.getByRole('button', { name: /remove account only/i }));

    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });

  test('each row renders a safe Uniswap Explore trade link', async () => {
    renderAccounts();
    await screen.findByText(/no accounts yet/i);

    await addAccountViaForm('Main wallet', ADDR_A);
    await screen.findByText('Main wallet');

    const trade = screen.getByRole('link', { name: /trade/i });

    expect(trade.getAttribute('href').startsWith('https://app.uniswap.org/explore')).toBe(true);
    expect(trade).toHaveAttribute('target', '_blank');
    expect(trade).toHaveAttribute('rel', 'noopener noreferrer');
    // the wallet address cannot be handed to Uniswap and must never appear in the url
    expect(trade.getAttribute('href')).not.toContain(ADDR_A);
  });

  test('a corrupt localStorage value renders the empty state instead of throwing', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{{{ not json');

    renderAccounts();

    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });
});
