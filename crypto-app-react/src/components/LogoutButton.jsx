import React from 'react';
import { useAuth } from '../context/AuthContext';

// C20 -- Logout control. Delegates to AuthContext's logout() rather than
// calling the API client directly, so the session-state transition to
// 'unauthenticated' always happens alongside the server-side revoke.
export default function LogoutButton() {
  const { logout } = useAuth();

  return (
    <button type="button" onClick={() => logout()}>
      Log out
    </button>
  );
}
