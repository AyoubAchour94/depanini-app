import { meResponseSchema } from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

import { customerProfiles, driverProfiles, users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

describe('DELETE /me (e2e)', () => {
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

  const server = () => app.getHttpServer();
  const as = (token: string) => `Bearer ${token}`;
  const alice = 'token-alice:alice@example.com';
  const bob = 'token-bob:bob@example.com';

  /** Creates the account with both profiles, as someone using both apps would have. */
  async function createAccountWithProfiles(token: string) {
    const me = meResponseSchema.parse(
      (await request(server()).get('/me').set('Authorization', as(token)).expect(200)).body,
    );
    await request(server())
      .put('/me/customer-profile')
      .set('Authorization', as(token))
      .send({ fullName: 'Alice', phone: '+21698123456' })
      .expect(200);
    await request(server())
      .put('/me/driver-profile')
      .set('Authorization', as(token))
      .send({
        fullName: 'Alice',
        phone: '+21698123456',
        truckType: 'flatbed',
        plateNumber: '123 TU 4567',
      })
      .expect(200);
    return me;
  }

  it('rejects a request without a token', async () => {
    await request(server()).delete('/me').expect(401);
  });

  it('deletes the account and both its profiles', async () => {
    await createAccountWithProfiles(alice);

    await request(server()).delete('/me').set('Authorization', as(alice)).expect(204);

    expect(await database.db.select().from(users)).toHaveLength(0);
    expect(await database.db.select().from(customerProfiles)).toHaveLength(0);
    expect(await database.db.select().from(driverProfiles)).toHaveLength(0);
  });

  it('leaves other accounts alone', async () => {
    await createAccountWithProfiles(alice);
    await createAccountWithProfiles(bob);

    await request(server()).delete('/me').set('Authorization', as(alice)).expect(204);

    const remaining = await database.db.select().from(users);
    expect(remaining.map((account) => account.email)).toEqual(['bob@example.com']);
    expect(await database.db.select().from(customerProfiles)).toHaveLength(1);
    expect(await database.db.select().from(driverProfiles)).toHaveLength(1);
  });

  it('succeeds when the account is already gone', async () => {
    await request(server()).delete('/me').set('Authorization', as(alice)).expect(204);
  });

  it('gives a later GET /me a fresh, empty account', async () => {
    const before = await createAccountWithProfiles(alice);
    await request(server()).delete('/me').set('Authorization', as(alice)).expect(204);

    const after = meResponseSchema.parse(
      (await request(server()).get('/me').set('Authorization', as(alice)).expect(200)).body,
    );
    expect(after.id).not.toBe(before.id);
    expect(after).toMatchObject({ customerProfile: null, driverProfile: null });
  });
});
