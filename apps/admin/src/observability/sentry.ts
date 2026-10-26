import { scrubSentryEvent } from '@depanini/shared';
import * as Sentry from '@sentry/react';

/** The `package.json` version, injected by Vite (see vite.config.ts). */
declare const __APP_VERSION__: string;

type Env = Record<string, string | undefined>;

/**
 * Starts error reporting, only when `VITE_SENTRY_DSN` is set; without it nothing is initialised
 * and nothing is sent (dev, tests). Returns whether it started. Personal data is removed in
 * `beforeSend`, and the SDK is told not to collect any. Errors only, no tracing or replay.
 */
export function initSentry(
  env: Env = import.meta.env as Env,
  sdk: Pick<typeof Sentry, 'init'> = Sentry,
): boolean {
  const dsn = env.VITE_SENTRY_DSN;
  if (!dsn) return false;
  sdk.init({
    dsn,
    environment: env.VITE_SENTRY_ENVIRONMENT || env.MODE || 'production',
    release: `depanini-admin@${__APP_VERSION__}`,
    // v11 replaced `sendDefaultPii` with `dataCollection`; this is the same "no PII" setting.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
    beforeSend: (event) => scrubSentryEvent(event),
  });
  return true;
}

/** Wraps the app: a render error is reported (when started) and replaced by a plain message. */
export const ErrorBoundary = Sentry.ErrorBoundary;
