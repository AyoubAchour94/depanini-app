import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { RATE_LIMITED } from '@depanini/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  ID_TOKEN_VERIFIER,
  type IdTokenVerifier,
  verifyBearerToken,
} from '../auth/firebase-auth.guard.js';

/** Methods that only read; the `write` throttler ignores them. */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The API-wide rate limit (`@nestjs/throttler`, registered as a global guard). Signed-in
 * callers are tracked by Firebase uid, everyone else by client IP. Each caller has one
 * bucket per throttler for the whole API, not one per route. A blocked request answers
 * `429 { code: RATE_LIMITED }` with `Retry-After` in seconds. WebSocket messages are not
 * limited here.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
  ) {
    super(options, storage, reflector);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() !== 'http';
  }

  protected override async getTracker(request: FastifyRequest): Promise<string> {
    // An invalid token counts against the IP; the route's FirebaseAuthGuard answers 401.
    const user = await verifyBearerToken(request, this.verifier)?.catch(() => undefined);
    return user ? `uid:${user.uid}` : `ip:${await super.getTracker(request)}`;
  }

  protected override generateKey(_context: ExecutionContext, tracker: string, name: string) {
    return `${name}:${tracker}`;
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    { timeToBlockExpire }: ThrottlerLimitDetail,
  ): Promise<void> {
    context.switchToHttp().getResponse<FastifyReply>().header('Retry-After', timeToBlockExpire);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: RATE_LIMITED,
        message: 'Too many requests, try again shortly',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
