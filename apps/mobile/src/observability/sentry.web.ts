import * as Sentry from '@sentry/react';
import Constants from 'expo-constants';

import { env } from '@/config/env';
import { variant } from '@/variant/variant';

import { initSentryWith } from './sentry-core';

/** Web (`pnpm web:user`): the browser SDK, the React Native one targets native only. */
export function initSentry(): boolean {
  // Before anything is read: a build without a DSN does no Sentry work at all.
  if (!env.sentryDsn) return false;
  return initSentryWith(Sentry, {
    dsn: env.sentryDsn,
    environment: env.environment,
    release: `${variant.bundleId}@${Constants.expoConfig?.version ?? 'unknown'}`,
  });
}

/** Nothing to wrap on web: the browser SDK reports uncaught errors by itself. */
export function withSentry(Root: () => React.JSX.Element): () => React.JSX.Element {
  return Root;
}
