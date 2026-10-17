import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';

import { env } from '@/config/env';
import { getFirebaseStatus } from '@/firebase/firebase';

/** The signed-in Firebase user, reduced to what the app needs. */
export interface AuthUser {
  uid: string;
  email: string | null;
}

let emulatorConnected = false;

function auth() {
  const instance = getAuth();
  if (env.authEmulatorUrl && !emulatorConnected) {
    connectAuthEmulator(instance, env.authEmulatorUrl);
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
