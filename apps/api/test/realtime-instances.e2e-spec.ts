import { customerOfferSchema, estimateRoadDistanceM, suggestFare } from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

import { users } from '../src/db/schema.js';
import { approveDriverByToken } from './support/approve-driver.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';
import { connectAs, type TestSocket } from './support/ws-client.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };

/**
 * Two API instances on one database, as when Cloud Run scales out: an event raised
 * through one reaches the sockets held by the other (over Postgres LISTEN/NOTIFY).
 */
describe('realtime across API instances (e2e)', () => {
  const database = connectTestDatabase();
  let a: NestFastifyApplication;
  let b: NestFastifyApplication;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    [a, b] = await Promise.all([createTestApp(database.db), createTestApp(database.db)]);
    await a.listen(0, '127.0.0.1');
    await b.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    await database.db.delete(users);
  });

  afterEach(() => {
    for (const client of sockets.splice(0)) {
      expect(client.invalid).toEqual([]);
      client.close();
    }
  });

  afterAll(async () => {
    await Promise.all([a.close(), b.close()]);
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const dan = 'token-dan:dan@example.com';
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  const api = (
    app: NestFastifyApplication,
    method: 'get' | 'post' | 'put',
    path: string,
    token: string,
  ) => request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
  const connect = async (app: NestFastifyApplication, token: string) => {
    const client = await connectAs(app, token);
    sockets.push(client);
    return client;
  };

  /** Alice's open request near Dan, who is online; everything through instance A. */
  const setUp = async () => {
    await api(a, 'put', '/me/customer-profile', alice)
      .send({ fullName: 'Alice Customer', phone: '+21698111111' })
      .expect(200);
    await api(a, 'put', '/me/driver-profile', dan)
      .send({
        fullName: 'Dan Driver',
        phone: '+21698222222',
        truckType: 'flatbed',
        plateNumber: '1 TU 2',
      })
      .expect(200);
    await approveDriverByToken(database.db, dan);
    await api(a, 'put', '/driver/presence', dan)
      .send({ online: true, location: laMarsa })
      .expect(200);
    const created = await api(a, 'post', '/tow-requests', alice)
      .send({
        pickup: tunis,
        dropoff: sousse,
        vehicleType: 'car',
        problemType: 'breakdown',
        proposedFare: suggested,
      })
      .expect(201);
    return created.body as { id: string };
  };

  it('delivers an event raised through instance A to a socket on instance B', async () => {
    const req = await setUp();
    const customerOnB = await connect(b, alice);

    const offer = await api(a, 'post', `/tow-requests/${req.id}/offers`, dan)
      .send({ fare: suggested })
      .expect(201);

    const forCustomer = customerOfferSchema.parse((await customerOnB.next('offer.updated')).offer);
    expect(forCustomer).toMatchObject({
      id: offer.body.id,
      status: 'pending',
      driver: { fullName: 'Dan Driver' },
    });
  });

  it('reaches the sockets on both instances once each, whichever instance raised it', async () => {
    const req = await setUp();
    const [customerOnA, customerOnB, driverOnB] = await Promise.all([
      connect(a, alice),
      connect(b, alice),
      connect(b, dan),
    ]);
    const offer = await api(b, 'post', `/tow-requests/${req.id}/offers`, dan)
      .send({ fare: suggested })
      .expect(201);
    for (const client of [customerOnA, customerOnB, driverOnB]) await client.next('offer.updated');

    await api(a, 'post', `/offers/${offer.body.id}/accept`, alice).expect(200);

    for (const client of [customerOnA, customerOnB]) {
      expect((await client.next('request.updated')).request).toMatchObject({
        id: req.id,
        status: 'assigned',
      });
      expect((await client.next('offer.updated')).offer).toMatchObject({ status: 'accepted' });
    }
    expect((await driverOnB.next('request.updated')).request).toMatchObject({
      id: req.id,
      customer: { fullName: 'Alice Customer' },
    });
    expect((await driverOnB.next('offer.updated')).offer).toMatchObject({ status: 'accepted' });

    // Dan moves through instance A; Alice hears it on both instances, and no event twice.
    await api(a, 'put', '/driver/presence', dan)
      .send({ online: true, location: laMarsa })
      .expect(200);
    for (const client of [customerOnA, customerOnB]) await client.next('driver.location');
    for (const client of [customerOnA, customerOnB, driverOnB]) {
      await client.settle();
      expect(client.inbox.filter((message) => message.type !== 'nearby.changed')).toEqual([]);
    }
  });
});
