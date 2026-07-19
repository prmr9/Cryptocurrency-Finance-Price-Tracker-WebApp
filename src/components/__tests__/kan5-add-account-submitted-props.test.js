const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.resolve(__dirname, '../Accounts.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// KAN-5 / KAN-4 regression: add_account_submitted must report address_format,
// not the raw address_length. FAILS on current code, passes after the rename.

// Text of the object literal passed to track("add_account_submitted", { ... }).
function submittedTrackProps(src) {
  const match = /track\s*\(\s*['"]add_account_submitted['"]\s*,/.exec(src);
  if (!match) return null;

  const braceStart = src.indexOf('{', match.index + match[0].length);
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return null;
}

describe('KAN-5: add_account_submitted instrumentation properties', () => {
  test('the add_account_submitted event is instrumented in Accounts.js', () => {
    expect(source).toMatch(/track\s*\(\s*['"]add_account_submitted['"]/);
  });

  test('its properties object uses address_format, not address_length', () => {
    const props = submittedTrackProps(source);
    expect(props).not.toBeNull();

    // Retained from KAN-4.
    expect(props).toMatch(/\blabel_provided\b/);
    expect(props).toMatch(/\bexisting_account_count\b/);

    // The fix: describe the address format and drop the raw length.
    expect(props).toMatch(/\baddress_format\b/);
    expect(props).not.toMatch(/\baddress_length\b/);
  });
});
