import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Accounts from '../Accounts';

// --- analytics capture -------------------------------------------------
// The KAN-5 instrumentation is expected to emit events through a `track`
// facade. We capture every plausible sink so the assertions below are about
// the *payload* of the events, not about where the facade happens to live.
global.__CAPTURED_EVENTS__ = [];

const record = (name, props) => {
  global.__CAPTURED_EVENTS__.push({ name, props });
};

// babel-plugin-jest-hoist requires the second argument of `jest.mock` to be an
// inline function literal, so the factory body is repeated per sink. It pushes
// straight onto `global.__CAPTURED_EVENTS__` because the hoisted factory runs
// before any module-scope binding is initialised.
// Only the emit boundary is swapped: the rest of the module (session helpers,
// address classifier, retention bookkeeping) is kept real, because Accounts.js
// imports those and a factory that returned track alone would hand it
// `undefined` for every one of them.
jest.mock(
  '../../services/analytics',
  () => {
    const actual = jest.requireActual('../../services/analytics');
    const track = (name, props) => {
      global.__CAPTURED_EVENTS__.push({ name, props });
    };
    return { ...actual, __esModule: true, track, default: track, trackEvent: track };
  },
  { virtual: true }
);
jest.mock(
  '../../services/track',
  () => {
    const track = (name, props) => {
      global.__CAPTURED_EVENTS__.push({ name, props });
    };
    return { __esModule: true, track, default: track, trackEvent: track };
  },
  { virtual: true }
);
jest.mock(
  '../../services/telemetry',
  () => {
    const track = (name, props) => {
      global.__CAPTURED_EVENTS__.push({ name, props });
    };
    return { __esModule: true, track, default: track, trackEvent: track };
  },
  { virtual: true }
);
jest.mock(
  '../../analytics',
  () => {
    const track = (name, props) => {
      global.__CAPTURED_EVENTS__.push({ name, props });
    };
    return { __esModule: true, track, default: track, trackEvent: track };
  },
  { virtual: true }
);
jest.mock(
  '../../lib/analytics',
  () => {
    const track = (name, props) => {
      global.__CAPTURED_EVENTS__.push({ name, props });
    };
    return { __esModule: true, track, default: track, trackEvent: track };
  },
  { virtual: true }
);
jest.mock(
  '../../utils/analytics',
  () => {
    const track = (name, props) => {
      global.__CAPTURED_EVENTS__.push({ name, props });
    };
    return { __esModule: true, track, default: track, trackEvent: track };
  },
  { virtual: true }
);

// Values deliberately chosen to be unmistakable substrings. The wallet
// address is all-lowercase so that a normalising implementation cannot
// accidentally dodge the substring check.
const WALLET_ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01';
const ACCOUNT_LABEL = 'Rainy Day Vault';

const descriptorFor = (input) =>
  [input.name, input.id, input.placeholder, input.getAttribute('aria-label')]
    .filter(Boolean)
    .join(' ');

// Label text is matched through Testing Library's accessible-name query
// rather than a `label[for=...]` lookup, so no raw node access is needed.
const pickInput = (pattern, fallbackIndex) => {
  const inputs = screen.queryAllByRole('textbox');
  const byLabel = screen.queryAllByLabelText(pattern, { selector: 'input' });
  return (
    byLabel[0] ||
    inputs.find((input) => pattern.test(descriptorFor(input))) ||
    inputs[fallbackIndex]
  );
};

const renderAccounts = () =>
  render(
    <MemoryRouter initialEntries={['/accounts']}>
      <Routes>
        <Route path="/accounts" element={<Accounts />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  global.__CAPTURED_EVENTS__ = [];
  window.localStorage.clear();

  // Additional sinks some instrumentations reach for directly.
  window.track = (name, props) => record(name, props);
  window.analytics = { track: (name, props) => record(name, props) };
  window.dataLayer = {
    push: (payload) => record(payload && payload.event, payload),
  };
});

afterEach(() => {
  window.localStorage.clear();
  delete window.track;
  delete window.analytics;
  delete window.dataLayer;
});

describe('KAN-5 accounts instrumentation', () => {
  test('emits onboarding events without leaking the wallet address or account label', async () => {
    renderAccounts();

    const addressInput = pickInput(/address|wallet|0x/i, 1);
    const labelInput = pickInput(/label|name|nickname/i, 0);

    expect(addressInput).toBeTruthy();
    expect(labelInput).toBeTruthy();

    fireEvent.change(labelInput, { target: { value: ACCOUNT_LABEL } });
    fireEvent.change(addressInput, { target: { value: WALLET_ADDRESS } });

    const buttons = screen.getAllByRole('button');
    const submit =
      buttons.find((button) => /add|save|create/i.test(button.textContent)) ||
      buttons[0];
    expect(submit).toBeTruthy();

    fireEvent.click(submit);

    // The account must actually land in the list before we judge the events.
    await waitFor(() => {
      expect(screen.getByText(ACCOUNT_LABEL)).toBeInTheDocument();
    });

    const captured = global.__CAPTURED_EVENTS__;
    const names = captured.map((event) => event.name);

    // The instrumentation described by KAN-5 must actually fire.
    expect(captured.length).toBeGreaterThan(0);
    expect(names).toContain('accounts_view_opened');
    expect(names).toContain('account_added');

    // No secret or user-identifying material may ride along in any property.
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(WALLET_ADDRESS);
    expect(serialized).not.toContain(ACCOUNT_LABEL);

    // Guard against case-normalising implementations smuggling the same data.
    const serializedLower = serialized.toLowerCase();
    expect(serializedLower).not.toContain(WALLET_ADDRESS.toLowerCase());
    expect(serializedLower).not.toContain(ACCOUNT_LABEL.toLowerCase());
  });
});
