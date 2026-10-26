import { scrubSentryEvent } from '@depanini/shared';

/** What the two SDKs (`@sentry/react-native` and `@sentry/react`) share: the start call. */
export interface SentrySdk {
  // `never`: both SDKs take their own options type; this only passes ours through.
  init: (options: never) => unknown;
}

export interface SentrySettings {
  /** Unset means error reporting is off. */
  dsn: string | undefined;
  environment: string;
  release: string;
}

/**
 * Starts error reporting with the given SDK, only when there is a DSN; without one nothing is
 * initialised and nothing is sent (dev, tests). Returns whether it started. Personal data is
 * removed in `beforeSend` and `sendDefaultPii` is off. Errors only, no tracing or replay.
 */
export function initSentryWith(sdk: SentrySdk, settings: SentrySettings): boolean {
  if (!settings.dsn) return false;
  sdk.init({
    dsn: settings.dsn,
    environment: settings.environment,
    release: settings.release,
    sendDefaultPii: false,
    beforeSend: (event: object) => scrubSentryEvent(event),
  } as never);
  return true;
}
