import fs from 'fs';
import path from 'path';
import { TRADE_URL, buildTradeUrl, CHAIN_SLUGS } from '../../services/uniswap';

const UNISWAP_PATH = path.resolve(__dirname, '..', '..', 'services', 'uniswap.js');
const NAVBAR_PATH = path.resolve(__dirname, '..', 'Navbar.js');

const source = fs.readFileSync(UNISWAP_PATH, 'utf8');
const navbarSource = fs.readFileSync(NAVBAR_PATH, 'utf8');

// KAN-5 moved TRADE_URL out of Navbar.js and into src/services/uniswap.js so the
// navbar and the per-account Trade links share one outbound-link contract. The
// guarantee this file guards is unchanged — the URL is still a module-level
// literal, not something assembled at render time — only its home moved.
describe('shared TRADE_URL constant', () => {
  test('is exported at module level with the uniswap explore url', () => {
    const declaration = /^export\s+const\s+TRADE_URL\s*=\s*['"]https:\/\/app\.uniswap\.org\/explore['"]\s*;?\s*$/m;

    expect(declaration.test(source)).toBe(true);
    expect(TRADE_URL).toBe('https://app.uniswap.org/explore');
  });

  test('Navbar consumes the shared constant instead of re-declaring one', () => {
    expect(navbarSource).toMatch(
      /^import\s+\{\s*TRADE_URL\s*\}\s+from\s+['"]\.\.\/services\/uniswap['"]\s*;?\s*$/m
    );
    expect(navbarSource).not.toMatch(/^const\s+TRADE_URL\s*=/m);
    expect(navbarSource).not.toContain('https://app.uniswap.org');
  });

  test('carries a known chain as a chain slug and never leaks an unmapped id', () => {
    expect(buildTradeUrl(137)).toBe(`${TRADE_URL}?chain=polygon`);
    expect(CHAIN_SLUGS[1]).toBe('mainnet');

    [undefined, null, 999999, 'nope', {}, NaN].forEach((bad) => {
      expect(buildTradeUrl(bad)).toBe(TRADE_URL);
    });
  });

  test('never constructs a wallet-address parameter', () => {
    expect(source).not.toMatch(/[?&]address=/);
    expect(source).not.toMatch(/[?&]account=/);
    expect(source).not.toMatch(/[?&]wallet=/);
  });
});
