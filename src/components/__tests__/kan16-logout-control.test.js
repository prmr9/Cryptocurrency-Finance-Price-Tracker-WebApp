import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import LogoutButton from '../LogoutButton';

// Any method the real client code calls resolves based on this proxy, so the
// test doesn't need to know the exact apiClient method names.
jest.mock('../../api/apiClient', () => {
  const cache = {};
  const handler = {
    get(target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return new Proxy({}, handler);
      if (!cache[prop]) {
        cache[prop] = jest.fn(() =>
          Promise.resolve({
            success: true,
            token: 'test-token',
            user: { id: 'test-user', email: 'test@example.com' },
          })
        );
      }
      return cache[prop];
    },
  };
  return new Proxy({}, handler);
});

jest.mock('../../utils/legacyMigration', () => ({
  __esModule: true,
  migrateLegacyData: jest.fn().mockResolvedValue(undefined),
  hasLegacyData: jest.fn().mockReturnValue(false),
  LEGACY_KEYS: { default: 'coinsearch.portfolio.v1', watchlist: 'coinsearch.watchlist.v1' },
}));

function StatusProbe() {
  const { status } = useAuth();
  return <span data-testid="status">{status}</span>;
}

function Harness() {
  const { login } = useAuth();
  return (
    <div>
      <StatusProbe />
      <button onClick={() => login('test@example.com', 'Password123!')}>login</button>
      <LogoutButton />
    </div>
  );
}

describe('Logout control (KAN-16 contract C20)', () => {
  // Unit: the context value itself must expose logout(), otherwise no
  // consumer (LogoutButton included) can transition session state.
  it('exposes a logout() callback from useAuth', () => {
    let captured;
    function Capture() {
      captured = useAuth();
      return null;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );

    expect(typeof captured.logout).toBe('function');
  });

  // Integration: LogoutButton wired to AuthProvider actually flips status.
  it('transitions status to unauthenticated when LogoutButton is clicked', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    fireEvent.click(screen.getByText('Log out'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  // Functional/e2e: full login -> logout session round trip.
  it('leaves the user logged out after a full login -> logout flow', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');

    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    fireEvent.click(screen.getByText('Log out'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });
});
