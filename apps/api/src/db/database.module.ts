import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import { PoolTimeoutFilter } from './pool-timeout.filter.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

/** Injection token for the Drizzle {@link Database}. */
export const DB = Symbol('DB');
const POOL = Symbol('PG_POOL');
const logger = new Logger('Database');

@Global()
@Module({
  providers: [
    { provide: APP_FILTER, useClass: PoolTimeoutFilter },
    {
      provide: POOL,
      inject: [ENV],
      useFactory: (env: Env) => {
        const pool = new pg.Pool({
          connectionString: env.DATABASE_URL,
          max: env.DB_POOL_MAX,
          // An exhausted pool fails fast (503, see PoolTimeoutFilter) instead of hanging.
          connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
        });
        // Idle clients emit 'error' when the server drops them (restart,
        // failover). Unhandled, that event crashes the process; the pool
        // discards the dead client by itself, so logging is enough.
        pool.on('error', (err) => logger.warn(`Idle Postgres client error: ${err.message}`));
        return pool;
      },
    },
    {
      provide: DB,
      inject: [POOL],
      useFactory: (pool: pg.Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
