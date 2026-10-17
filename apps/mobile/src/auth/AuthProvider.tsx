import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { getFirebaseStatus } from '@/firebase/firebase';

import { type AuthUser, subscribeToAuth } from './firebase-auth';

export type AuthState =
  /** Firebase hasn't reported the persisted session yet (keep the splash up). */
  | { status: 'loading' }
  | { status: 'signed-in'; user: AuthUser }
  /** `unavailableReason` is set when sign-in can't work (Firebase not configured). */
  | { status: 'signed-out'; unavailableReason?: string };

const AuthContext = createContext<AuthState | undefined>(undefined);

/** Tracks the Firebase session and exposes it through {@link useAuth}. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    if (!getFirebaseStatus().configured) return;
    return subscribeToAuth((user) =>
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' }),
    );
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

function initialState(): AuthState {
  const firebase = getFirebaseStatus();
  return firebase.configured
    ? { status: 'loading' }
    : { status: 'signed-out', unavailableReason: firebase.reason };
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>');
  return state;
}
