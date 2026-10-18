import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { env } from '@/config/env';
import { getFirebaseStatus } from '@/firebase/firebase';

import type { AuthUser } from './firebase-auth';

// Web counterpart of firebase-auth.ts: the same functions over the Firebase JS SDK.

let emulatorConnected = false;

function auth() {
  const instance = getAuth();
  if (env.authEmulatorUrl && !emulatorConnected) {
    connectAuthEmulator(instance, env.authEmulatorUrl, { disableWarnings: true });
    emulatorConnected = true;
  }
  return instance;
}

/**
 * Calls `listener` with the current user now and on every sign-in/sign-out.
 * Returns the unsubscribe function. Only call when Firebase is configured.
 */
export function subscribeToAuth(listener: (user: AuthUser | null) => void): () => void {
  if (!getFirebaseStatus().configured) throw new Error('Firebase is not configured');
  return onAuthStateChanged(auth(), (user) =>
    listener(user ? { uid: user.uid, email: user.email } : null),
  );
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth(), email, password);
}

export async function signUp(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(auth(), email, password);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth(), email);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth());
}

/**
 * Confirms the signed-in user's password with Firebase. Run it right before a
 * sensitive action, which Firebase refuses after an old sign-in
 * (`auth/requires-recent-login`).
 */
export async function reauthenticate(password: string): Promise<void> {
  const user = auth().currentUser;
  if (!user?.email)
    throw Object.assign(new Error('No email user signed in'), { code: 'auth/no-current-user' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

/** Deletes the signed-in Firebase user; the auth listener then reports a sign-out. */
export async function deleteCurrentUser(): Promise<void> {
  const user = auth().currentUser;
  if (!user) throw Object.assign(new Error('No user signed in'), { code: 'auth/no-current-user' });
  await deleteUser(user);
}
