import { customerProfileSchema, meResponseSchema } from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

import { customerProfiles, users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

describe('PUT /me/customer-profile (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp(database.db);
  });

  beforeEach(async () => {
    // Profiles go with their account (cascade).
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const putProfile = (body: object, token?: string) => {
    const req = request(app.getHttpServer()).put('/me/customer-profile').send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const getMe = (token: string) =>
    request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`);

  const alice = 'token-alice:alice@example.com';

  it('rejects a request without a token', async () => {
    await putProfile({ fullName: 'Alice', phone: '+21698123456' }).expect(401);
  });

  it('creates the profile and returns it normalized', async () => {
    const res = await putProfile(
      { fullName: '  Alice Ben Salah ', phone: '98 123 456' },
      alice,
    ).expect(200);

    expect(customerProfileSchema.parse(res.body)).toEqual({
      fullName: 'Alice Ben Salah',
      phone: '+21698123456',
    });
    expect(await database.db.select().from(customerProfiles)).toHaveLength(1);
  });

  it('shows the profile in GET /me', async () => {
    await putProfile({ fullName: 'Alice', phone: '+21698123456' }, alice).expect(200);

    const me = meResponseSchema.parse((await getMe(alice).expect(200)).body);
    expect(me.customerProfile).toEqual({ fullName: 'Alice', phone: '+21698123456' });
  });

  it('works before the account exists', async () => {
    await putProfile({ fullName: 'Alice', phone: '+21698123456' }, alice).expect(200);

    expect(await database.db.select().from(users)).toHaveLength(1);
  });

  it('updates an existing profile', async () => {
    await putProfile({ fullName: 'Alice', phone: '+21698123456' }, alice).expect(200);
    const res = await putProfile({ fullName: 'Alice B.', phone: '+21622333444' }, alice).expect(
      200,
    );

    expect(res.body).toEqual({ fullName: 'Alice B.', phone: '+21622333444' });
    expect(await database.db.select().from(customerProfiles)).toHaveLength(1);
  });

  it('keeps each account to its own profile', async () => {
    await putProfile({ fullName: 'Alice', phone: '+21698123456' }, alice).expect(200);

    const bob = meResponseSchema.parse((await getMe('token-bob').expect(200)).body);
    expect(bob.customerProfile).toBeNull();
  });

  it.each([
    ['a missing name', { phone: '+21698123456' }],
    ['a blank name', { fullName: '   ', phone: '+21698123456' }],
    ['a non-Tunisian phone', { fullName: 'Alice', phone: '+33612345678' }],
    ['a short phone', { fullName: 'Alice', phone: '9812345' }],
  ])('rejects %s with 400 and the failing field', async (_, body) => {
    const res = await putProfile(body, alice).expect(400);

    expect(res.body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: expect.any(Array) })]),
    );
    expect(await database.db.select().from(customerProfiles)).toHaveLength(0);
  });
});
