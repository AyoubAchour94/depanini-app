import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@depanini/shared';
import type { FastifyReply } from 'fastify';

import { HealthService } from './health.service.js';

/**
 * `GET /health` — liveness + dependency check. Replaces the Phase 1
 * `healthCheck` Cloud Function. Unauthenticated by design: uptime checks and
 * the app's connectivity indicator call it.
 *
 * Returns 200 when everything is up, 503 with the same body when degraded.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status !== 'ok') reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
