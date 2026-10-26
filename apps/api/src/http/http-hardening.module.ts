import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import { pinoHttpOptions } from './logging.js';
import { RequestTimeoutInterceptor } from './request-timeout.interceptor.js';
import { AppThrottlerGuard, SAFE_METHODS } from './throttler.guard.js';

/**
 * What every HTTP request goes through, whatever the route: structured logs with a
 * request id, the rate limits and the request timeout. Helmet, CORS and the proxy
 * setting are on the Fastify instance (see `configureApp`).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ pinoHttp: pinoHttpOptions(env) }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        // Retry-After is set by AppThrottlerGuard; the X-RateLimit-* headers are left out.
        setHeaders: false,
        throttlers: [
          { name: 'default', ttl: env.THROTTLE_TTL_MS, limit: env.THROTTLE_LIMIT },
          {
            name: 'write',
            ttl: env.THROTTLE_TTL_MS,
            limit: env.THROTTLE_WRITE_LIMIT,
            skipIf: (context) =>
              SAFE_METHODS.has(context.switchToHttp().getRequest<{ method: string }>().method),
          },
        ],
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestTimeoutInterceptor },
  ],
})
export class HttpHardeningModule {}
