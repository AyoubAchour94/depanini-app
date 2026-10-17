import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import type { Database } from '../../src/db/database.module.js';
import * as schema from '../../src/db/schema.js';

/**
 * Database for e2e tests that need real Postgres. Defaults to a
 * `depanini_test` database next to the local dev one (`pnpm db:up`), so tests
 * never touch dev data. CI points `TEST_DATABASE_URL` at its service container.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://depanini:depanini@localhost:5432/depanini_test';

/** Opens a connection to the test database. Close it with `close()` after the suite. */
export function connectTestDatabase(): { db: Database; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
