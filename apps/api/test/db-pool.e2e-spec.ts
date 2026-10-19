import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';

import * as schema from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { TEST_DATABASE_URL } from './support/test-database.js';

describe('an exhausted database pool (e2e)', () => {
  const pool = new pg.Pool({
    connectionString: TEST_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 200,
  });
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp(drizzle(pool, { schema }));
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('answers 503 instead of hanging, and recovers once a connection is free', async () => {
    const held = await pool.connect();
    try {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer token-pool:pool@example.com');
      expect(res.status).toBe(503);
    } finally {
      held.release();
    }
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer token-pool:pool@example.com')
      .expect(200);
  });
});
