import { driverProfileSchema, meResponseSchema } from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

import { driverProfiles, users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

describe('PUT /me/driver-profile (e2e)', () => {
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

  const putProfile = (path: string, body: object, token?: string) => {
    const req = request(app.getHttpServer()).put(path).send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const putDriverProfile = (body: object, token?: string) =>
    putProfile('/me/driver-profile', body, token);
  const getMe = (token: string) =>
    request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${token}`);

  const sami = 'token-sami:sami@example.com';
  const profile = {
    fullName: 'Sami Trabelsi',
    phone: '+21622333444',
    truckType: 'flatbed',
    plateNumber: '123 TU 4567',
  };

  it('rejects a request without a token', async () => {
    await putDriverProfile(profile).expect(401);
  });

  it('creates the profile and returns it normalized', async () => {
    const res = await putDriverProfile(
      {
        ...profile,
        fullName: ' Sami Trabelsi ',
        phone: '22 333 444',
        plateNumber: ' 123 tu 4567 ',
      },
      sami,
    ).expect(200);

    expect(driverProfileSchema.parse(res.body)).toEqual(profile);
    expect(await database.db.select().from(driverProfiles)).toHaveLength(1);
  });

  it('shows the profile in GET /me', async () => {
    await putDriverProfile(profile, sami).expect(200);

    const me = meResponseSchema.parse((await getMe(sami).expect(200)).body);
    expect(me.driverProfile).toEqual(profile);
    expect(me.customerProfile).toBeNull();
  });

  it('updates an existing profile', async () => {
    await putDriverProfile(profile, sami).expect(200);
    const updated = { ...profile, truckType: 'wheel_lift', plateNumber: 'RS 98765' };
    const res = await putDriverProfile(updated, sami).expect(200);

    expect(res.body).toEqual(updated);
    expect(await database.db.select().from(driverProfiles)).toHaveLength(1);
  });

  it('keeps it apart from the same account’s customer profile', async () => {
    await putProfile(
      '/me/customer-profile',
      { fullName: 'Sami', phone: '+21698123456' },
      sami,
    ).expect(200);
    await putDriverProfile(profile, sami).expect(200);

    const me = meResponseSchema.parse((await getMe(sami).expect(200)).body);
    expect(me.customerProfile).toEqual({ fullName: 'Sami', phone: '+21698123456' });
    expect(me.driverProfile).toEqual(profile);
  });

  it.each([
    ['a missing name', { fullName: undefined }, 'fullName'],
    ['a non-Tunisian phone', { phone: '+33612345678' }, 'phone'],
    ['an unknown truck type', { truckType: 'crane' }, 'truckType'],
    ['a blank plate', { plateNumber: '  ' }, 'plateNumber'],
  ])('rejects %s with 400 and the failing field', async (_, override, field) => {
    const res = await putDriverProfile({ ...profile, ...override }, sami).expect(400);

    expect(res.body.issues).toEqual([expect.objectContaining({ path: [field] })]);
    expect(await database.db.select().from(driverProfiles)).toHaveLength(0);
  });
});
