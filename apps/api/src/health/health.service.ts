import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse } from '@depanini/shared';
import { sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';

/** How long the DB ping may take before the database counts as down. */
const DB_PING_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(@Inject(DB) private readonly db: Pick<Database, 'execute'>) {}

  async check(): Promise<HealthResponse> {
    const dbUp = await this.pingDatabase();
    return {
      status: dbUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbUp ? 'up' : 'down',
    };
  }

  private async pingDatabase(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('DB ping timed out')), DB_PING_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.db.execute(sql`select 1`), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
