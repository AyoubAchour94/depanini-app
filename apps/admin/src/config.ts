/** The build-time settings, from `VITE_*` variables (see `.env.example`). */
export interface Config {
  apiUrl: string;
  firebase: { apiKey: string; projectId: string; authDomain?: string; appId?: string };
  /** Set in dev: the Firebase Auth emulator. */
  authEmulatorUrl?: string;
}

type Env = Record<string, string | undefined>;

export function readConfig(env: Env = import.meta.env as Env): Config {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    throw new Error('Set VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_API_KEY (see .env.example).');
  }
  return {
    apiUrl: env.VITE_API_URL || 'http://localhost:3000',
    firebase: {
      apiKey,
      projectId,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
      appId: env.VITE_FIREBASE_APP_ID || undefined,
    },
    authEmulatorUrl: env.VITE_AUTH_EMULATOR_URL || undefined,
  };
}
