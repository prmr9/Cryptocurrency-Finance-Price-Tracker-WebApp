import {
  listAccounts,
  addAccount,
  removeAccount,
  setActiveAccount,
  getActiveAccountId,
  ADDRESS_RE
} from '../accountStore';

const STORAGE_KEY = 'coinsearch.accounts.v1';
const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
// same address in two casings — must be treated as one account
const ADDR_LOWER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const ADDR_UPPER = '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD';

beforeEach(() => {
  window.localStorage.clear();
});

describe('accountStore', () => {
  test('every public method returns a Promise (the migration seam)', () => {
    expect(listAccounts()).toBeInstanceOf(Promise);
    expect(getActiveAccountId()).toBeInstanceOf(Promise);
    expect(removeAccount('nope')).toBeInstanceOf(Promise);
    expect(setActiveAccount('nope').catch(() => {})).toBeInstanceOf(Promise);
    expect(addAccount({ label: '', address: '' }).catch(() => {})).toBeInstanceOf(Promise);
  });

  test('a valid account persists and the first one becomes active', async () => {
    const created = await addAccount({ label: 'Main', address: ADDR_A, chainId: 1 });

    expect(await listAccounts()).toHaveLength(1);
    expect(await getActiveAccountId()).toBe(created.id);
  });

  test('adding a second account leaves the first one active', async () => {
    const first = await addAccount({ label: 'Main', address: ADDR_A, chainId: 1 });
    await addAccount({ label: 'Cold', address: ADDR_B, chainId: 137 });

    expect(await listAccounts()).toHaveLength(2);
    expect(await getActiveAccountId()).toBe(first.id);
  });

  test('an invalid address is rejected and nothing is persisted', async () => {
    await expect(addAccount({ label: 'Bad', address: '0xnothex' })).rejects.toThrow(
      /valid public wallet address/i
    );

    expect(await listAccounts()).toHaveLength(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('an empty label is rejected', async () => {
    await expect(addAccount({ label: '   ', address: ADDR_A })).rejects.toThrow(/label/i);
    expect(await listAccounts()).toHaveLength(0);
  });

  test('a duplicate address is rejected case-insensitively', async () => {
    await addAccount({ label: 'Main', address: ADDR_LOWER });

    await expect(
      addAccount({ label: 'Same wallet', address: ADDR_UPPER })
    ).rejects.toThrow(/already been added/i);

    expect(await listAccounts()).toHaveLength(1);
  });

  test('removing the active account promotes another', async () => {
    const first = await addAccount({ label: 'Main', address: ADDR_A });
    const second = await addAccount({ label: 'Cold', address: ADDR_B });

    await removeAccount(first.id);

    expect(await getActiveAccountId()).toBe(second.id);
    expect(await listAccounts()).toHaveLength(1);
  });

  test('removing the last account clears the active pointer', async () => {
    const only = await addAccount({ label: 'Main', address: ADDR_A });

    await removeAccount(only.id);

    expect(await listAccounts()).toHaveLength(0);
    expect(await getActiveAccountId()).toBeNull();
  });

  test('setActiveAccount switches the pointer and rejects unknown ids', async () => {
    await addAccount({ label: 'Main', address: ADDR_A });
    const second = await addAccount({ label: 'Cold', address: ADDR_B });

    await setActiveAccount(second.id);
    expect(await getActiveAccountId()).toBe(second.id);

    await expect(setActiveAccount('acct_missing')).rejects.toThrow(/no longer exists/i);
  });

  test('corrupt JSON degrades to empty state instead of throwing', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json at all');

    await expect(listAccounts()).resolves.toEqual([]);
    await expect(getActiveAccountId()).resolves.toBeNull();
  });

  test('partial or foreign shapes degrade to empty state', async () => {
    const shapes = [
      '[]',
      'null',
      '{"version":2,"accounts":[]}',
      '{"version":1,"accounts":"nope"}',
      '{"version":1,"accounts":[{"id":"a"}]}'
    ];

    for (const shape of shapes) {
      window.localStorage.setItem(STORAGE_KEY, shape);
      await expect(listAccounts()).resolves.toEqual([]);
    }
  });

  test('a dangling activeAccountId is reconciled to null', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        accounts: [{ id: 'a1', label: 'Main', address: ADDR_A, chainId: 1, createdAt: '' }],
        activeAccountId: 'ghost'
      })
    );

    expect(await getActiveAccountId()).toBeNull();
    expect(await listAccounts()).toHaveLength(1);
  });

  test('addresses are stored lowercased and no secret material is written', async () => {
    await addAccount({ label: 'Main', address: `  ${ADDR_UPPER}  ` });

    const raw = window.localStorage.getItem(STORAGE_KEY);

    expect(JSON.parse(raw).accounts[0].address).toBe(ADDR_LOWER);
    expect(raw).not.toMatch(/privateKey|seed|mnemonic|password/i);
  });

  test('ADDRESS_RE accepts 40 hex chars in either case and nothing else', () => {
    expect(ADDRESS_RE.test(ADDR_A)).toBe(true);
    expect(ADDRESS_RE.test('0xABCDEFabcdef0123456789ABCDEFabcdef012345')).toBe(true);
    expect(ADDRESS_RE.test('0x123')).toBe(false);
    expect(ADDRESS_RE.test(`${ADDR_A}0`)).toBe(false);
    expect(ADDRESS_RE.test('1111111111111111111111111111111111111111')).toBe(false);
  });
});
