import { createContext, type ReactNode, use, useEffect, useMemo, useRef, useState } from 'react';

import type { AuthService } from './service';

/** Why the person was sent back to sign-in; the sign-in page turns it into text. */
export const NOT_ADMIN_NOTICE = 'notAdmin';

export type AuthState =
  | { status: 'loading' }
  /** `notice` says why the person was sent back to sign-in. */
  | { status: 'signedOut'; notice?: typeof NOT_ADMIN_NOTICE }
  | { status: 'admin'; email: string | null };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Signs out because the API refused the session (401/403): the admin claim is gone. */
  endRevokedSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Follows the Firebase session. Only an account with the `admin` claim counts as signed
 * in: anyone else is signed out again straight away and told "Not an admin".
 */
export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const notice = useRef<typeof NOT_ADMIN_NOTICE | undefined>(undefined);

  useEffect(
    () =>
      service.subscribe((session) => {
        if (session?.isAdmin) {
          notice.current = undefined;
          setState({ status: 'admin', email: session.email });
          return;
        }
        if (session) {
          // Signed in but not an admin: remember why, then sign out.
          notice.current = NOT_ADMIN_NOTICE;
          void service.signOut();
          return;
        }
        setState({ status: 'signedOut', notice: notice.current });
      }),
    [service],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: (email, password) => service.signIn(email, password),
      signOut: () => service.signOut(),
      endRevokedSession: () => {
        notice.current = NOT_ADMIN_NOTICE;
        return service.signOut();
      },
    }),
    [service, state],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth needs an AuthProvider');
  return value;
}
