import { healthResponseSchema } from '@depanini/shared';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { ENV } from '../src/config/env.module.js';
import { DB } from '../src/db/database.module.js';

/**
 * Boots the real AppModule over Fastify with the database swapped for a fake,
 * so the suite is hermetic (no Postgres needed) while still exercising
 * routing, DI and serialization end to end.
 */
async function createApp(dbIsUp: boolean) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({
      NODE_ENV: 'test',
      PORT: 0,
      DATABASE_URL: 'postgres://unused@localhost/unused',
      FIREBASE_PROJECT_ID: 'depanini-test',
      CORS_ORIGINS: [],
    })
    .overrideProvider(DB)
    .useValue({
      execute: async () => {
        if (!dbIsUp) throw new Error('connection refused');
      },
    })
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('GET /health (e2e)', () => {
  let app: NestFastifyApplication;

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 and status ok when the database is up', async () => {
    app = await createApp(true);

    const res = await request(app.getHttpServer()).get('/health').expect(200);

    const body = healthResponseSchema.parse(res.body);
    expect(body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('returns 503 and status degraded when the database is down', async () => {
    app = await createApp(false);

    const res = await request(app.getHttpServer()).get('/health').expect(503);

    expect(healthResponseSchema.parse(res.body)).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
