import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFirebaseAuthService } from './firebase-service';

const firebase = vi.hoisted(() => ({
  emit: null as null | ((user: unknown) => void),
}));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  connectAuthEmulator: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn((_auth: unknown, callback: (user: unknown) => void) => {
    firebase.emit = callback;
    return () => {};
  }),
}));

const config = { apiUrl: 'http://api', firebase: { apiKey: 'k', projectId: 'p' } };

/** A user whose forced token refresh resolves when the test says so. */
function slowUser(email: string) {
  let finish!: (claims: Record<string, unknown>) => void;
  const user = {
    email,
    getIdTokenResult: vi.fn(
      () => new Promise((resolve) => (finish = (claims) => resolve({ claims }))),
    ),
  };
  return { user, finish: (claims: Record<string, unknown>) => finish(claims) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  firebase.emit = null;
});

describe('firebase auth service', () => {
  it('reports the admin claim of the refreshed token', async () => {
    const listener = vi.fn();
    createFirebaseAuthService(config).subscribe(listener);
    const { user, finish } = slowUser('a@example.com');
    firebase.emit?.(user);
    finish({ admin: true });
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith({ email: 'a@example.com', isAdmin: true }),
    );
  });

  it('ignores a token result that arrives after sign-out', async () => {
    const listener = vi.fn();
    createFirebaseAuthService(config).subscribe(listener);
    const { user, finish } = slowUser('a@example.com');
    firebase.emit?.(user);
    firebase.emit?.(null);
    finish({ admin: true });
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(null);
  });

  it('keeps only the latest of two overlapping refreshes', async () => {
    const listener = vi.fn();
    createFirebaseAuthService(config).subscribe(listener);
    const first = slowUser('first@example.com');
    const second = slowUser('second@example.com');
    firebase.emit?.(first.user);
    firebase.emit?.(second.user);
    second.finish({});
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    first.finish({ admin: true });
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ email: 'second@example.com', isAdmin: false });
  });
});
