import fs from 'fs';
import path from 'path';

const NAVBAR_PATH = path.resolve(__dirname, '..', 'Navbar.js');
const source = fs.readFileSync(NAVBAR_PATH, 'utf8');

describe('Navbar TRADE_URL constant', () => {
  test('declares TRADE_URL at module level with the uniswap url', () => {
    const declaration = /^const\s+TRADE_URL\s*=\s*['"]https:\/\/app\.uniswap\.org['"]\s*;?\s*$/m;

    expect(declaration.test(source)).toBe(true);
  });

  test('the declaration is outside the Navbar component body', () => {
    const lines = source.split('\n');
    const constLine = lines.findIndex((l) => /^const\s+TRADE_URL\s*=/.test(l));
    const componentLine = lines.findIndex((l) =>
      /(function\s+Navbar\b|const\s+Navbar\s*=|class\s+Navbar\b)/.test(l)
    );

    expect(constLine).toBeGreaterThan(-1);
    expect(componentLine).toBeGreaterThan(-1);
    expect(constLine).toBeLessThan(componentLine);
  });
});
