import { vi } from 'vitest';

import type { ApiClient } from '../api/client';
import type { AuthService, AuthSession } from '../auth/service';

interface Account {
  password: string;
  isAdmin: boolean;
}

/** An in-memory {@link AuthService}: sign in with one of `accounts`, or start signed in. */
export function createFakeAuth(
  accounts: Record<string, Account>,
  signedInAs?: string,
): AuthService & { signOutCalls: number } {
  let session: AuthSession | null = signedInAs
    ? { email: signedInAs, isAdmin: accounts[signedInAs]?.isAdmin ?? false }
    : null;
  const listeners = new Set<(session: AuthSession | null) => void>();
  const emit = () => listeners.forEach((listener) => listener(session));

  const fake = {
    signOutCalls: 0,
    subscribe(listener: (session: AuthSession | null) => void) {
      listeners.add(listener);
      listener(session);
      return () => void listeners.delete(listener);
    },
    async signIn(email: string, password: string) {
      const account = accounts[email];
      if (account?.password !== password)
        throw Object.assign(new Error('invalid'), { code: 'auth/invalid-credential' });
      session = { email, isAdmin: account.isAdmin };
      emit();
    },
    async signOut() {
      fake.signOutCalls += 1;
      session = null;
      emit();
    },
    async getToken() {
      return session ? 'test-token' : null;
    },
  };
  return fake;
}

/** An {@link ApiClient} whose methods are mocks; routes are matched on the path. */
export function createFakeApi(
  handlers: {
    get?: (path: string) => unknown;
    post?: (path: string, body: unknown) => unknown;
    blob?: (path: string) => Blob;
  } = {},
) {
  return {
    get: vi.fn(async (path: string) => handlers.get?.(path)),
    post: vi.fn(async (path: string, body: unknown) => handlers.post?.(path, body)),
    blob: vi.fn(async (path: string) => handlers.blob?.(path) ?? new Blob(['x'])),
  } as unknown as ApiClient & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    blob: ReturnType<typeof vi.fn>;
  };
}
