import { getApps, initializeApp } from 'firebase/app';
import { getAuth, getIdToken } from 'firebase/auth';
import { z } from 'zod';

import type { FirebaseStatus } from './firebase';

/**
 * Web counterpart of firebase.ts. React Native Firebase is native-only, so the
 * web build initializes the Firebase JS SDK with the project's registered web
 * app instead. Same contract: never throws, reports why when unavailable.
 */
const webConfigSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  appId: z.string().min(1),
  storageBucket: z.string().optional(),
  messagingSenderId: z.string().optional(),
});

let status: FirebaseStatus | undefined;

export function getFirebaseStatus(): FirebaseStatus {
  if (status) return status;

  const raw = process.env.EXPO_PUBLIC_FIREBASE_WEB_CONFIG;
  if (!raw) {
    status = {
      configured: false,
      reason: 'EXPO_PUBLIC_FIREBASE_WEB_CONFIG is not set (see apps/mobile/.env.example).',
    };
  } else {
    try {
      const config = webConfigSchema.parse(JSON.parse(raw));
      if (getApps().length === 0) initializeApp(config);
      status = { configured: true };
    } catch (error) {
      status = { configured: false, reason: `Invalid Firebase web config: ${String(error)}` };
    }
  }

  if (__DEV__ && !status.configured) {
    console.warn(`Firebase not configured: ${status.reason}`);
  }
  return status;
}

export async function getCurrentIdToken(): Promise<string | undefined> {
  if (!getFirebaseStatus().configured) return undefined;
  const user = getAuth().currentUser;
  return user ? getIdToken(user) : undefined;
}
