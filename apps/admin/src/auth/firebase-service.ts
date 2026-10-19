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
      return onAuthStateChanged(auth, (user) => {
        if (!user) return listener(null);
        // Force a refresh so a claim granted since the last sign-in is seen.
        void user.getIdTokenResult(true).then(
          (result) => listener({ email: user.email, isAdmin: result.claims.admin === true }),
          () => listener({ email: user.email, isAdmin: false }),
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
