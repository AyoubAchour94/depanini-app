import { type ArgumentsHost, Catch, ServiceUnavailableException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/** `pg` fails a connection wait that exceeds `connectionTimeoutMillis` with this message. */
export function isPoolTimeout(error: unknown): boolean {
  const cause = (error as { cause?: unknown } | null)?.cause ?? error;
  return cause instanceof Error && /timeout exceeded when trying to connect/i.test(cause.message);
}

/** Turns "no free database connection in time" into `503` instead of an opaque `500`. */
@Catch()
export class PoolTimeoutFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(
      isPoolTimeout(exception)
        ? new ServiceUnavailableException('The service is busy, try again shortly')
        : exception,
      host,
    );
  }
}
