import { meResponseSchema } from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

import { users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

describe('GET /me (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp(database.db);
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
