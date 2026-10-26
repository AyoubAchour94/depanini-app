import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type Observable, throwError, timeout } from 'rxjs';

import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';

/**
 * Answers `503` when a handler runs longer than `REQUEST_TIMEOUT_MS`, so a stuck request
 * frees the client instead of hanging. The handler's work is not cancelled; its late
 * result is dropped. Uploads (multipart bodies, which a slow phone network can take a
 * while to send) and WebSocket messages are left alone.
 */
@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  constructor(@Inject(ENV) private readonly env: Env) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    if (context.switchToHttp().getRequest<FastifyRequest>().isMultipart?.()) return next.handle();
    return next.handle().pipe(
      timeout({
        first: this.env.REQUEST_TIMEOUT_MS,
        with: () =>
          throwError(
            () => new ServiceUnavailableException('The request took too long, try again shortly'),
          ),
      }),
    );
  }
}
