import { meResponseSchema } from '@depanini/shared';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DecodedIdToken } from 'firebase-admin/auth';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { ID_TOKEN_VERIFIER, type IdTokenVerifier } from '../src/auth/firebase-auth.guard.js';
import { ENV } from '../src/config/env.module.js';
import { DB } from '../src/db/database.module.js';
import { users } from '../src/db/schema.js';
import { connectTestDatabase, TEST_DATABASE_URL } from './support/test-database.js';

/** Accepts `token-<uid>` (with an optional `:<email>`) as a valid ID token. */
const fakeVerifier: IdTokenVerifier = {
  verifyIdToken: async (token) => {
    const match = /^token-([^:]+)(?::(.+))?$/.exec(token);
    if (!match) throw new Error('auth/argument-error');
    return { uid: match[1], email: match[2] } as DecodedIdToken;
  },
};

describe('GET /me (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue({
        NODE_ENV: 'test',
        PORT: 0,
        DATABASE_URL: TEST_DATABASE_URL,
        FIREBASE_PROJECT_ID: 'depanini-test',
        CORS_ORIGINS: [],
      })
      .overrideProvider(DB)
      .useValue(database.db)
      .overrideProvider(ID_TOKEN_VERIFIER)
      .useValue(fakeVerifier)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const getMe = (token?: string) => {
    const req = request(app.getHttpServer()).get('/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('rejects a request without a token', async () => {
    await getMe().expect(401);
  });

  it('rejects an invalid token', async () => {
    await getMe('forged').expect(401);
  });

  it('creates the account on the first call', async () => {
    const res = await getMe('token-alice:alice@example.com').expect(200);

    expect(meResponseSchema.parse(res.body)).toMatchObject({
      email: 'alice@example.com',
      customerProfile: null,
      driverProfile: null,
    });
    expect(await database.db.select().from(users)).toHaveLength(1);
  });

  it('returns the same account on later calls', async () => {
    const first = await getMe('token-alice:alice@example.com').expect(200);
    const second = await getMe('token-alice:alice@example.com').expect(200);

    expect(second.body.id).toBe(first.body.id);
    expect(await database.db.select().from(users)).toHaveLength(1);
  });

  it('keeps the email in sync with Firebase', async () => {
    await getMe('token-alice:alice@example.com').expect(200);
    const res = await getMe('token-alice:alice@new.example.com').expect(200);

    expect(res.body.email).toBe('alice@new.example.com');
  });

  it('gives each Firebase user their own account', async () => {
    const alice = await getMe('token-alice:alice@example.com').expect(200);
    const bob = await getMe('token-bob').expect(200);

    expect(bob.body.id).not.toBe(alice.body.id);
    expect(bob.body.email).toBeNull();
  });
});
