import { createRequire } from 'node:module';

import { scrubSentryEvent } from '@depanini/shared';
import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';

import type { Env } from '../config/env.js';

// src/observability and dist/observability are both two levels below the package root.
const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };

/**
 * Starts error reporting, only when `SENTRY_DSN` is set; without it nothing is initialised
 * and nothing is sent (dev, tests, any deploy that did not opt in). Returns whether it started.
 * Personal data is removed in `beforeSend`, and the SDK is told not to collect any. There is no tracing:
 * it reports errors only.
 */
export function initSentry(
  env: Pick<Env, 'NODE_ENV'> & Partial<Pick<Env, 'SENTRY_DSN' | 'SENTRY_ENVIRONMENT'>>,
  sdk: Pick<typeof Sentry, 'init'> = Sentry,
): boolean {
  if (!env.SENTRY_DSN) return false;
  sdk.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: `depanini-api@${version}`,
    // v11 replaced `sendDefaultPii` with `dataCollection`; this is the same "no PII" setting, and
    // also keeps request headers, cookies and bodies out of the events.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
    beforeSend: (event) => scrubSentryEvent(event),
  });
  return true;
}

/** Unexpected errors and 5xx responses are reported; 4xx are the caller's mistakes. */
export function shouldReport(exception: unknown): boolean {
  return !(exception instanceof HttpException) || exception.getStatus() >= 500;
}

/**
 * Reports what {@link shouldReport} accepts, then answers like Nest's default filter. The
 * Sentry call does nothing when the SDK was not initialised.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (shouldReport(exception)) Sentry.captureException(exception);
    super.catch(exception, host);
  }
}
