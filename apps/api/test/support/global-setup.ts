import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { TEST_DATABASE_URL } from './test-database.js';

/**
 * Runs once before the e2e suite: creates the test database if it is missing
 * and applies every migration in `drizzle/`.
 */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);

  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `e2e tests need Postgres at ${url.host} (start it with \`pnpm db:up\`): ${String(error)}`,
    );
  }
  try {
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (!rowCount) await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  } finally {
    await pool.end();
  }
}
