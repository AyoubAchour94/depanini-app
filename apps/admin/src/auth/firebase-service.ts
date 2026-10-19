import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

import type { Config } from '../config';
import type { AuthService } from './service';

/** The Firebase Auth implementation of {@link AuthService} (the emulator in dev). */
export function createFirebaseAuthService(config: Config): AuthService {
  const auth = getAuth(initializeApp(config.firebase));
  if (config.authEmulatorUrl) {
    connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true });
  }

  return {
    subscribe(listener) {
      // Each auth change supersedes the one before: a slow token refresh that finishes
      // after sign-out (or after a newer change) must not bring the old session back.
      let latest = 0;
      return onAuthStateChanged(auth, (user) => {
        const change = ++latest;
        if (!user) return listener(null);
        const report = (isAdmin: boolean) => {
          if (change === latest) listener({ email: user.email, isAdmin });
        };
        // Force a refresh so a claim granted since the last sign-in is seen.
        void user.getIdTokenResult(true).then(
          (result) => report(result.claims.admin === true),
          () => report(false),
        );
      });
    },
    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOut: () => signOut(auth),
    async getToken() {
      return (await auth.currentUser?.getIdToken()) ?? null;
    },
  };
}
