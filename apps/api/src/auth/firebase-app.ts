import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';

import type { Env } from '../config/env.js';

/**
 * The one firebase-admin app of the API, created on first use and shared by auth and push.
 * Verifying ID tokens only needs the project id (Google's public keys are fetched
 * automatically); sending pushes needs a service account, so credentials are loaded
 * only when `PUSH_PROVIDER=fcm`.
 */
export function firebaseApp(
  env: Pick<Env, 'FIREBASE_PROJECT_ID'> &
    Partial<Pick<Env, 'PUSH_PROVIDER' | 'FIREBASE_SERVICE_ACCOUNT_JSON'>>,
) {
  const existing = getApps()[0];
  if (existing) return existing;
  const options: Parameters<typeof initializeApp>[0] = { projectId: env.FIREBASE_PROJECT_ID };
  if (env.PUSH_PROVIDER === 'fcm') {
    options.credential = env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON))
      : applicationDefault();
  }
  return initializeApp(options);
}
