import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { env } from '@/config/env';
import { variant } from '@/variant/variant';

import { initSentryWith } from './sentry-core';

/** Native (iOS, Android). The web build uses `sentry.web.ts`, which runs `@sentry/react`. */
export function initSentry(): boolean {
  // Before anything is read: a build without a DSN does no Sentry work at all.
  if (!env.sentryDsn) return false;
  return initSentryWith(Sentry, {
    dsn: env.sentryDsn,
    environment: env.environment,
    release: `${variant.bundleId}@${Constants.expoConfig?.version ?? 'unknown'}`,
  });
}

/** Wraps the root component so render errors and touches are reported (when started). */
export function withSentry(Root: () => React.JSX.Element): () => React.JSX.Element {
  return Sentry.wrap(Root) as () => React.JSX.Element;
}
