import { Platform } from 'react-native';
import { z } from 'zod';

/**
 * Public, build-time configuration. Values come from `apps/mobile/.env`
 * locally (see `.env.example`) and from EAS environment variables in CI.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the JS bundle, so they must never
 * hold secrets. Each one has to be referenced literally (`process.env.X`) for
 * the inlining to work, hence the explicit object below.
 *
 * Missing values do not crash the app: the screens that need them show what
 * is missing instead (as the Phase 1 Flutter app did).
 */
const DEFAULT_PRIVACY_URL = 'https://ayoubachour94.github.io/depanini-app/legal/privacy-en/';
const DEFAULT_TERMS_URL = 'https://ayoubachour94.github.io/depanini-app/legal/terms-en/';

const envSchema = z.object({
  mapboxAccessToken: z.string().startsWith('pk.').optional().catch(undefined),
  apiUrl: z.url().optional().catch(undefined),
  environment: z.enum(['dev', 'staging', 'prod']).catch('dev'),
  /** Sentry project DSN; unset means error reporting is off (src/observability). */
  sentryDsn: z.string().min(1).optional().catch(undefined),
  /** Firebase Auth emulator (e.g. `http://localhost:9099`); unset to use the real project. */
  authEmulatorUrl: z.url().optional().catch(undefined),
  /** Lets the driver app pretend to be at a chosen place in Tunisia; never on in store builds by default. */
  enableTestLocation: z.boolean(),
  /** The published legal pages (docs/legal, see CI.md); the default is the GitHub Pages address. */
  privacyUrl: z.url().catch(DEFAULT_PRIVACY_URL),
  termsUrl: z.url().catch(DEFAULT_TERMS_URL),
});

export const env = envSchema.parse({
  mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
  // A browser reaches the API on localhost, while the Android emulator needs
  // 10.0.2.2, so the web build can override the URL.
  apiUrl:
    Platform.OS === 'web'
      ? (process.env.EXPO_PUBLIC_WEB_API_URL ?? process.env.EXPO_PUBLIC_API_URL)
      : process.env.EXPO_PUBLIC_API_URL,
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
  // Same host split as the API URL.
  authEmulatorUrl:
    Platform.OS === 'web'
      ? (process.env.EXPO_PUBLIC_WEB_AUTH_EMULATOR_URL ?? process.env.EXPO_PUBLIC_AUTH_EMULATOR_URL)
      : process.env.EXPO_PUBLIC_AUTH_EMULATOR_URL,
  enableTestLocation: __DEV__ || process.env.EXPO_PUBLIC_ENABLE_TEST_LOCATION === '1',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL || undefined,
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || undefined,
});
