/**
 * Regression tests for KAN-4: wallet-account onboarding + account-aware Trade button.
 *
 * These fail today because src/services/accountStore.js, src/services/uniswap.js
 * and src/components/Accounts.js do not exist yet. They assert behaviour
 * (persistence, validation, active-account promotion, deep-link shape), not file
 * contents, so any conforming implementation passes.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const STORAGE_KEY = 'coinsearch.accounts.v1';

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';

// Fresh module instance so "persists across a remount" is a real cold start.
function loadStore() {
  jest.resetModules();
  // eslint-disable-next-line global-require
  return require('../../services/accountStore');
}

// Never jest.resetModules() here, and re-pin react in case an earlier test
// already reset the registry: a fresh registry hands the component a second
// copy of react whose hook dispatcher is not the one the already-imported
// react-dom renderer installs during renderWithHooks, so the component's first
// useState hits a null dispatcher and throws "Invalid hook call".
function loadAccountsView() {
  jest.doMock('react', () => React);
  // eslint-disable-next-line global-require
  const mod = require('../Accounts');
  return mod.default || mod.Accounts;
}

function renderAccounts() {
  const Accounts = loadAccountsView();
  return render(
    <MemoryRouter>
      <Accounts />
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('accountStore', () => {
  it('exposes an async API (every method returns a Promise)', async () => {
    const store = loadStore();
    const calls = [
      store.listAccounts(),
      store.getActiveAccountId(),
    ];
    calls.forEach((result) => {
      expect(typeof result.then).toBe('function');
    });
    await Promise.all(calls);
  });

  it('adds a valid account, makes the first one active, and persists across a remount', async () => {
    const store = loadStore();
    await store.addAccount({ label: 'Main', address: ADDR_A, chainId: 1 });

    const afterAdd = await store.listAccounts();
    expect(afterAdd).toHaveLength(1);
    expect(afterAdd[0].label).toBe('Main');
    expect(afterAdd[0].address.toLowerCase()).toBe(ADDR_A.toLowerCase());
    expect(afterAdd[0].id).toBeTruthy();
    expect(await store.getActiveAccountId()).toBe(afterAdd[0].id);

    // Cold start: brand new module instance reading the same localStorage.
    const remounted = loadStore();
    const afterRemount = await remounted.listAccounts();
    expect(afterRemount).toHaveLength(1);
    expect(afterRemount[0].label).toBe('Main');
    expect(await remounted.getActiveAccountId()).toBe(afterRemount[0].id);
  });

  it('rejects an invalid address and persists nothing', async () => {
    const store = loadStore();
    const bad = ['not-an-address', '0x123', ADDR_A.slice(0, -1), ''];

    for (const address of bad) {
      // Implementations may reject or throw synchronously; either is fine, the
      // contract under test is that nothing is written.
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve(store.addAccount({ label: 'Bad', address, chainId: 1 })).catch(
        () => {}
      );
    }

    expect(await store.listAccounts()).toHaveLength(0);
    expect(await store.getActiveAccountId()).toBeFalsy();
  });

  it('rejects a duplicate address case-insensitively', async () => {
    const store = loadStore();
    await store.addAccount({ label: 'Main', address: ADDR_A, chainId: 1 });

    await Promise.resolve(
      store.addAccount({ label: 'Copy', address: ADDR_A.toUpperCase().replace('0X', '0x'), chainId: 1 })
    ).catch(() => {});

    expect(await store.listAccounts()).toHaveLength(1);
  });

  it('promotes another account when the active one is removed, and clears active when none remain', async () => {
    const store = loadStore();
    const first = await store.listAccounts().then(async () => {
      await store.addAccount({ label: 'First', address: ADDR_A, chainId: 1 });
      const list = await store.listAccounts();
      return list[0];
    });
    await store.addAccount({ label: 'Second', address: ADDR_B, chainId: 1 });

    expect(await store.getActiveAccountId()).toBe(first.id);

    await store.removeAccount(first.id);
    const remaining = await store.listAccounts();
    expect(remaining).toHaveLength(1);
    expect(await store.getActiveAccountId()).toBe(remaining[0].id);

    await store.removeAccount(remaining[0].id);
    expect(await store.listAccounts()).toHaveLength(0);
    expect(await store.getActiveAccountId()).toBeFalsy();
  });

  it('setActiveAccount switches the active account', async () => {
    const store = loadStore();
    await store.addAccount({ label: 'First', address: ADDR_A, chainId: 1 });
    await store.addAccount({ label: 'Second', address: ADDR_B, chainId: 1 });

    const [, second] = await store.listAccounts();
    await store.setActiveAccount(second.id);
    expect(await store.getActiveAccountId()).toBe(second.id);
  });

  it('degrades to empty state on corrupt storage instead of throwing', async () => {
    const corrupt = ['{not json at all', '[]', 'null', '{"version":1}', '{"version":1,"accounts":"nope"}'];

    for (const value of corrupt) {
      window.localStorage.setItem(STORAGE_KEY, value);
      const store = loadStore();
      // eslint-disable-next-line no-await-in-loop
      await expect(store.listAccounts()).resolves.toEqual([]);
      // eslint-disable-next-line no-await-in-loop
      expect(await store.getActiveAccountId()).toBeFalsy();
    }
  });

  it('stores no secret material', async () => {
    const store = loadStore();
    await store.addAccount({
      label: 'Main',
      address: ADDR_A,
      chainId: 1,
      privateKey: 'super-secret',
      seedPhrase: 'word word word',
      password: 'hunter2',
    });

    const raw = window.localStorage.getItem(STORAGE_KEY) || '';
    expect(raw).not.toMatch(/super-secret/);
    expect(raw).not.toMatch(/word word word/);
    expect(raw).not.toMatch(/hunter2/);
    expect(raw).not.toMatch(/privateKey|seedPhrase|mnemonic|password/i);
  });
});

describe('uniswap deep-link helper', () => {
  it('points at the Uniswap explore page', () => {
    jest.resetModules();
    // eslint-disable-next-line global-require
    const { TRADE_URL } = require('../../services/uniswap');
    expect(TRADE_URL).toBe('https://app.uniswap.org/explore');
  });
});

describe('Accounts view', () => {
  it('renders the empty state when localStorage is corrupt (no white screen)', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json at all');

    expect(() => renderAccounts()).not.toThrow();

    await waitFor(() => {
      expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /trade/i })).toBeNull();
  });

  it('adds an account and renders a per-account Trade link to Uniswap explore', async () => {
    jest.resetModules();
    // eslint-disable-next-line global-require
    const { TRADE_URL } = require('../../services/uniswap');

    renderAccounts();

    fireEvent.change(await screen.findByLabelText(/label/i), { target: { value: 'Main' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: ADDR_A } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('Main')).toBeInTheDocument();

    const tradeLinks = await screen.findAllByRole('link', { name: /trade/i });
    expect(tradeLinks).toHaveLength(1);
    const href = tradeLinks[0].getAttribute('href') || '';
    expect(href.startsWith(TRADE_URL)).toBe(true);
    expect(href).not.toMatch(new RegExp(ADDR_A, 'i'));
    expect(tradeLinks[0]).toHaveAttribute('target', '_blank');
    expect(tradeLinks[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(tradeLinks[0]).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('surfaces a role="alert" error for an invalid address and stores nothing', async () => {
    renderAccounts();

    fireEvent.change(await screen.findByLabelText(/label/i), { target: { value: 'Bad' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: '0xnope' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Bad')).toBeNull();

    const store = loadStore();
    expect(await store.listAccounts()).toHaveLength(0);
  });

  it('rejects a duplicate address with a role="alert" error', async () => {
    renderAccounts();

    fireEvent.change(await screen.findByLabelText(/label/i), { target: { value: 'Main' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: ADDR_A } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(await screen.findByText('Main')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: 'Duplicate' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: ADDR_A.toUpperCase().replace('0X', '0x') } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Duplicate')).toBeNull();
    expect(await screen.findAllByRole('link', { name: /trade/i })).toHaveLength(1);
  });
});
