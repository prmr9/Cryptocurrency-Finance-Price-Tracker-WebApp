import fs from 'fs';
import path from 'path';
import { TRADE_URL, buildTradeUrl, CHAIN_SLUGS } from '../../services/uniswap';

const NAVBAR_PATH = path.resolve(__dirname, '..', 'Navbar.js');
const source = fs.readFileSync(NAVBAR_PATH, 'utf8');

describe('shared TRADE_URL constant', () => {
  test('is exported from the uniswap service with the Explore url as its value', () => {
    expect(TRADE_URL).toBe('https://app.uniswap.org/explore');
  });

  test('Navbar imports the constant instead of hardcoding the url', () => {
    expect(source).toMatch(/import\s*\{\s*TRADE_URL\s*\}\s*from\s*'\.\.\/services\/uniswap'/);
    expect(source).not.toContain('https://app.uniswap.org');
  });

  test('carries a known chain as a chain slug and never leaks an unmapped id', () => {
    expect(buildTradeUrl(137)).toBe(`${TRADE_URL}?chain=polygon`);
    expect(CHAIN_SLUGS[1]).toBe('mainnet');

    [undefined, null, 999999, 'nope', {}, NaN].forEach((bad) => {
      expect(buildTradeUrl(bad)).toBe(TRADE_URL);
    });
  });

  test('never constructs a wallet-address parameter', () => {
    const uniswapSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'services', 'uniswap.js'),
      'utf8'
    );

    expect(uniswapSource).not.toMatch(/[?&]address=/);
    expect(uniswapSource).not.toMatch(/[?&]account=/);
    expect(uniswapSource).not.toMatch(/[?&]wallet=/);
  });
});
