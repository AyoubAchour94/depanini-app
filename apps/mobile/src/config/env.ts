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
const envSchema = z.object({
  mapboxAccessToken: z.string().startsWith('pk.').optional().catch(undefined),
  apiUrl: z.url().optional().catch(undefined),
  environment: z.enum(['dev', 'staging', 'prod']).catch('dev'),
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
});
