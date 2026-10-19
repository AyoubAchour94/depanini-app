import {
  customerOfferSchema,
  driverJobSchema,
  estimateRoadDistanceM,
  etaMinutes,
  offerSchema,
  PRESENCE_STALE_MS,
  suggestFare,
  towRequestSchema,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { DecodedIdToken } from 'firebase-admin/auth';
import request from 'supertest';

import { users } from '../src/db/schema.js';
import { RealtimeService } from '../src/realtime/realtime.service.js';
import { createTestApp, fakeVerifier } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';
import { connectAs, openSocket, type TestSocket } from './support/ws-client.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };
const ariana = { latitude: 36.8625, longitude: 10.1956 };

const AUTH_TIMEOUT_MS = 300;
const HEARTBEAT_MS = 150;
/** Long enough for a frame that was going to arrive to have arrived. */
const QUIET_MS = 150;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('realtime /ws (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    app = await createTestApp(database.db, {
      now: () => now,
      realtime: { authTimeoutMs: AUTH_TIMEOUT_MS, heartbeatMs: HEARTBEAT_MS },
    });
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    await database.db.delete(users);
  });

  afterEach(() => {
    for (const client of sockets.splice(0)) {
      expect(client.invalid).toEqual([]);
      client.close();
    }
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';
  /** Online near the pickup like the others, but never part of the trip. */
  const zed = 'token-zed:zed@example.com';

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const connect = async (token: string) => {
    const client = await connectAs(app, token);
    sockets.push(client);
    return client;
  };
  const open = async () => {
    const client = await openSocket(app);
    sockets.push(client);
    return client;
  };
  const goOnline = (token: string, location: { latitude: number; longitude: number } = laMarsa) =>
    api('put', '/driver/presence', token).send({ online: true, location }).expect(200);
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  /** Profiles for everyone, and the drivers online (Dan and the others near the pickup). */
  const setUpPeople = async () => {
    await api('put', '/me/customer-profile', alice)
      .send({ fullName: 'Alice Customer', phone: '+21698111111' })
      .expect(200);
    for (const [token, name] of [
      [dan, 'Dan Driver'],
      [eve, 'Eve Driver'],
      [zed, 'Zed Driver'],
    ] as const) {
      await api('put', '/me/driver-profile', token)
        .send({
          fullName: name,
          phone: '+21698222222',
          truckType: 'flatbed',
          plateNumber: '1 TU 2',
        })
        .expect(200);
      await goOnline(token, token === dan ? laMarsa : ariana);
    }
  };
  const createRequest = async () => {
    const created = await api('post', '/tow-requests', alice)
      .send({
        pickup: tunis,
        dropoff: sousse,
        vehicleType: 'car',
        problemType: 'breakdown',
        proposedFare: suggested,
      })
      .expect(201);
    return towRequestSchema.parse(created.body);
  };
  /** Profiles for everyone, drivers online, and Alice's open request. */
  const setUp = async () => {
    await setUpPeople();
    return createRequest();
  };
  const makeOffer = async (token: string, requestId: string) =>
    offerSchema.parse(
      (await api('post', `/tow-requests/${requestId}/offers`, token).send({ fare: suggested }))
        .body,
    );
  /** Alice's request with offers from Dan and Eve, Dan's accepted. */
  const assign = async () => {
    const req = await setUp();
    const danOffer = await makeOffer(dan, req.id);
    const eveOffer = await makeOffer(eve, req.id);
    await api('post', `/offers/${danOffer.id}/accept`, alice).expect(200);
    return { req, danOffer, eveOffer };
  };
  const stage = (to: string) =>
    api('post', '/driver/job/stage', dan).send({ stage: to }).expect(200);
  /** Nothing arrived, bar `nearby.changed` hints: online drivers near a request get those on any open-list change. */
  const expectQuiet = async (...clients: TestSocket[]) => {
    await pause(QUIET_MS);
    for (const client of clients) {
      expect(client.inbox.filter((message) => message.type !== 'nearby.changed')).toEqual([]);
    }
  };
  /** Nothing at all arrived, hints included. */
  const expectSilent = async (...clients: TestSocket[]) => {
    await pause(QUIET_MS);
    for (const client of clients) expect(client.inbox).toEqual([]);
  };

  describe('authentication', () => {
    it('answers auth.ok to a valid token', async () => {
      const client = await open();
      client.send({ type: 'auth', token: alice });
      await expect(client.next('auth.ok')).resolves.toEqual({ type: 'auth.ok' });
    });

    it('answers auth.error to a bad token and closes', async () => {
      const client = await open();
      client.send({ type: 'auth', token: 'forged' });
      expect(await client.next('auth.error')).toMatchObject({ type: 'auth.error' });
      expect((await client.closed).code).toBe(4401);
    });

    it('closes a socket that does not authenticate in time', async () => {
      const client = await open();
      const started = Date.now();
      expect((await client.closed).code).toBe(4408);
      expect(Date.now() - started).toBeGreaterThanOrEqual(AUTH_TIMEOUT_MS - 50);
    });

    it('closes a socket that sends a frame over 16 KiB', async () => {
      const client = await open();
      client.socket.send('x'.repeat(16 * 1024 + 1));
      expect((await client.closed).code).toBe(1009);
    });

    it('ignores messages before auth, then still accepts auth', async () => {
      const client = await open();
      client.socket.send('not json');
      client.send({ type: 'hello' });
      client.send({ type: 'auth' });
      client.send({ type: 'auth', token: '' });
      await expectQuiet(client);
      client.send({ type: 'auth', token: alice });
      await client.next('auth.ok');
    });

    it('ignores a second auth', async () => {
      const client = await connect(alice);
      client.send({ type: 'auth', token: 'forged' });
      await expectQuiet(client);
      expect(client.socket.readyState).toBe(client.socket.OPEN);
    });

    it('closes the socket when the token expires', async () => {
      await app.close();
      const shortLived = {
        verifyIdToken: async (token: string) => ({
          ...(await fakeVerifier.verifyIdToken(token)),
          exp: Date.now() / 1000 + 0.3,
        }),
      };
      app = await createTestApp(database.db, { now: () => now, verifier: shortLived });
      await app.listen(0, '127.0.0.1');
      try {
        const client = await connect(alice);
        expect((await client.closed).code).toBe(4401);
      } finally {
        await app.close();
        app = await createTestApp(database.db, {
          now: () => now,
          realtime: { authTimeoutMs: AUTH_TIMEOUT_MS, heartbeatMs: HEARTBEAT_MS },
        });
        await app.listen(0, '127.0.0.1');
      }
    });

    it('rejects a token with no expiry', async () => {
      await app.close();
      const noExpiry = {
        verifyIdToken: async (token: string) =>
          ({
            ...(await fakeVerifier.verifyIdToken(token)),
            exp: undefined,
          }) as unknown as DecodedIdToken,
      };
      app = await createTestApp(database.db, { now: () => now, verifier: noExpiry });
      await app.listen(0, '127.0.0.1');
      try {
        const client = await open();
        client.send({ type: 'auth', token: alice });
        await client.next('auth.error');
        expect((await client.closed).code).toBe(4401);
      } finally {
        await app.close();
        app = await createTestApp(database.db, {
          now: () => now,
          realtime: { authTimeoutMs: AUTH_TIMEOUT_MS, heartbeatMs: HEARTBEAT_MS },
        });
        await app.listen(0, '127.0.0.1');
      }
    });
  });

  describe('heartbeat', () => {
    it('keeps a socket that answers pings', async () => {
      const client = await connect(alice);
      await pause(HEARTBEAT_MS * 4);
      expect(client.socket.readyState).toBe(client.socket.OPEN);
    });

    it('drops a socket that stops answering pings', async () => {
      const client = await openSocket(app, { autoPong: false });
      sockets.push(client);
      client.send({ type: 'auth', token: alice });
      await client.next('auth.ok');
      const { code } = await client.closed;
      // Terminated, not closed: there is no close frame.
      expect(code).toBe(1006);
    });
  });

  describe('request.updated', () => {
    it('goes to the customer and the driver on accept, after the commit', async () => {
      const req = await setUp();
      const danOffer = await makeOffer(dan, req.id);
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);

      // `then` sends it now; the test reads the event before the response.
      const accepted = api('post', `/offers/${danOffer.id}/accept`, alice)
        .expect(200)
        .then((res) => res);
      const forCustomer = await customer.next('request.updated');
      // Read over another connection as soon as the event lands: the change is visible.
      const active = await api('get', '/tow-requests/active', alice).expect(200);
      expect(active.body).toMatchObject({ status: 'assigned' });
      await accepted;

      expect(towRequestSchema.parse(forCustomer.request)).toMatchObject({
        id: req.id,
        status: 'assigned',
        tripStage: 'accepted',
        driver: { fullName: 'Dan Driver', phone: '+21698222222' },
      });
      expect(forCustomer.request).not.toHaveProperty('customer');

      const forDriver = await driver.next('request.updated');
      expect(driverJobSchema.parse(forDriver.request)).toMatchObject({
        id: req.id,
        status: 'assigned',
        customer: { fullName: 'Alice Customer', phone: '+21698111111' },
      });
      expect(forDriver.request).toEqual((await api('get', '/driver/job', dan).expect(200)).body);
      await expectQuiet(stranger);
    });

    it('goes to both on each stage change, matching what REST returns', async () => {
      const { req } = await assign();
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);

      for (const next of ['en_route', 'arrived', 'towing'] as const) {
        now = new Date(now.getTime() + 60_000);
        const res = await stage(next);
        const forCustomer = await customer.next('request.updated');
        expect(forCustomer.request).toEqual(
          (await api('get', '/tow-requests/active', alice).expect(200)).body,
        );
        expect(forCustomer.request).toMatchObject({ id: req.id, tripStage: next });
        expect((await driver.next('request.updated')).request).toEqual(res.body);
      }
      await expectQuiet(stranger);
    });

    it('goes to both on complete, with the driver kept for the customer', async () => {
      const { req } = await assign();
      for (const next of ['en_route', 'arrived', 'towing']) await stage(next);
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);

      const res = await api('post', '/driver/job/complete', dan)
        .send({ cashReceived: true })
        .expect(200);

      const forCustomer = towRequestSchema.parse((await customer.next('request.updated')).request);
      expect(forCustomer).toMatchObject({
        id: req.id,
        status: 'completed',
        driver: { fullName: 'Dan Driver', truckType: 'flatbed', phone: null, plateNumber: null },
      });
      expect((await driver.next('request.updated')).request).toEqual(res.body);
      await expectQuiet(stranger);
    });

    it('carries the payment on complete, and goes to both on confirm and dispute', async () => {
      const { req } = await assign();
      for (const next of ['en_route', 'arrived', 'towing']) await stage(next);
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);

      const done = await api('post', '/driver/job/complete', dan)
        .send({ cashReceived: true })
        .expect(200);
      const completedForCustomer = (await customer.next('request.updated')).request;
      expect(completedForCustomer).toMatchObject({
        payment: { status: 'driver_confirmed', amountTnd: suggested },
      });
      expect(completedForCustomer).toEqual(
        (await api('get', '/tow-requests/active', alice).expect(200)).body,
      );
      expect((await driver.next('request.updated')).request).toEqual(done.body);

      const confirmed = await api('post', `/tow-requests/${req.id}/payment/confirm`, alice).expect(
        200,
      );
      for (const client of [customer, driver]) {
        const { request: pushed } = await client.next('request.updated');
        expect(towRequestSchema.parse(pushed)).toMatchObject({
          id: req.id,
          payment: { status: 'customer_confirmed' },
        });
        expect(pushed).toEqual(confirmed.body);
      }
      expect(confirmed.body.payment.receiptNo).toBe(done.body.payment.receiptNo);
      await expectQuiet(stranger);
    });

    it('goes to both when the customer disputes the payment', async () => {
      const { req } = await assign();
      for (const next of ['en_route', 'arrived', 'towing']) await stage(next);
      await api('post', '/driver/job/complete', dan).send({ cashReceived: true }).expect(200);
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);

      await api('post', `/tow-requests/${req.id}/payment/dispute`, alice)
        .send({ note: 'Asked for more' })
        .expect(200);
      for (const client of [customer, driver]) {
        const { request: pushed } = await client.next('request.updated');
        expect(towRequestSchema.parse(pushed)).toMatchObject({
          id: req.id,
          payment: { status: 'disputed' },
        });
        expect(JSON.stringify(pushed)).not.toContain('Asked for more');
      }
      await expectQuiet(stranger);
    });

    it('still answers the REST call when publishing fails', async () => {
      await assign();
      for (const next of ['en_route', 'arrived', 'towing']) await stage(next);
      await connect(alice);
      const send = vi.spyOn(app.get(RealtimeService), 'send').mockImplementation(() => {
        throw new Error('socket exploded');
      });

      try {
        const res = await api('post', '/driver/job/complete', dan)
          .send({ cashReceived: true })
          .expect(200);
        expect(res.body).toMatchObject({ status: 'completed' });
        expect(send).toHaveBeenCalled();
      } finally {
        send.mockRestore();
      }
    });

    it('goes to both on cancel, with who cancelled and why', async () => {
      const { req } = await assign();
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);

      await api('post', `/tow-requests/${req.id}/cancel`, dan)
        .send({ reason: 'truck_problem' })
        .expect(200);

      for (const client of [customer, driver]) {
        const { request: cancelled } = await client.next('request.updated');
        expect(towRequestSchema.parse(cancelled)).toMatchObject({
          id: req.id,
          status: 'cancelled',
          cancelledBy: 'driver',
          cancelReason: 'truck_problem',
          driver: null,
        });
        expect(cancelled).not.toHaveProperty('customer');
      }
      await expectQuiet(stranger);
    });

    it('goes to the customer when the driver deletes their account mid-job', async () => {
      const { req } = await assign();
      const customer = await connect(alice);
      await api('delete', '/me', dan).expect(204);
      expect((await customer.next('request.updated')).request).toMatchObject({
        id: req.id,
        status: 'cancelled',
        cancelledBy: 'driver',
        driver: null,
      });
    });

    it('goes to the customer when an open request is cancelled', async () => {
      const req = await setUp();
      const customer = await connect(alice);
      await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);
      expect((await customer.next('request.updated')).request).toMatchObject({
        id: req.id,
        status: 'cancelled',
        cancelledBy: 'customer',
      });
    });

    it('reaches every socket of the same user', async () => {
      const req = await setUp();
      const danOffer = await makeOffer(dan, req.id);
      const [phone, web] = await Promise.all([connect(alice), connect(alice)]);
      await api('post', `/offers/${danOffer.id}/accept`, alice).expect(200);
      await phone.next('request.updated');
      await web.next('request.updated');
    });

    it('stops once the socket is closed', async () => {
      const req = await setUp();
      const danOffer = await makeOffer(dan, req.id);
      const customer = await connect(alice);
      customer.close();
      await customer.closed;
      await api('post', `/offers/${danOffer.id}/accept`, alice).expect(200);
      await expectQuiet(customer);
    });
  });

  describe('offer.updated', () => {
    it('goes to the driver and the customer when an offer is made', async () => {
      const req = await setUp();
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);

      const offer = await makeOffer(dan, req.id);

      expect((await driver.next('offer.updated')).offer).toEqual(offer);
      const forCustomer = customerOfferSchema.parse((await customer.next('offer.updated')).offer);
      expect(forCustomer).toEqual({
        ...offer,
        driver: {
          fullName: 'Dan Driver',
          truckType: 'flatbed',
          rating: { average: null, count: 0 },
        },
      });
      await expectQuiet(stranger);
    });

    it('goes to each driver on accept: accepted to one, rejected to the other', async () => {
      const req = await setUp();
      const danOffer = await makeOffer(dan, req.id);
      const eveOffer = await makeOffer(eve, req.id);
      const [customer, danSocket, eveSocket, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(eve),
        connect(zed),
      ]);

      await api('post', `/offers/${danOffer.id}/accept`, alice).expect(200);

      const accepted = (await danSocket.next('offer.updated')).offer;
      expect(offerSchema.parse(accepted)).toMatchObject({ id: danOffer.id, status: 'accepted' });
      expect(accepted).not.toHaveProperty('driver');
      const rejected = (await eveSocket.next('offer.updated')).offer;
      expect(rejected).toEqual({ ...eveOffer, status: 'rejected' });
      // Eve's socket hears nothing about Dan's offer, nor the request itself.
      await expectQuiet(eveSocket, stranger);

      const forCustomer = [
        (await customer.next('offer.updated')).offer,
        (await customer.next('offer.updated')).offer,
      ];
      expect(forCustomer.map((o) => [o.id, o.status]).sort()).toEqual(
        [
          [danOffer.id, 'accepted'],
          [eveOffer.id, 'rejected'],
        ].sort(),
      );
    });

    it("tells the driver and the other customer when an accept withdraws the driver's other offers", async () => {
      const req = await setUp();
      await api('put', '/me/customer-profile', zed)
        .send({ fullName: 'Zed Customer', phone: '+21698444444' })
        .expect(200);
      const other = await api('post', '/tow-requests', zed)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201);
      const danOffer = await makeOffer(dan, req.id);
      const danElsewhere = await makeOffer(dan, other.body.id);
      const [danSocket, zedSocket] = await Promise.all([connect(dan), connect(zed)]);

      await api('post', `/offers/${danOffer.id}/accept`, alice).expect(200);

      const forZed = (await zedSocket.next('offer.updated')).offer;
      expect(customerOfferSchema.parse(forZed)).toMatchObject({
        id: danElsewhere.id,
        status: 'withdrawn',
      });
      const forDan = [
        (await danSocket.next('offer.updated')).offer,
        (await danSocket.next('offer.updated')).offer,
      ];
      expect(forDan.map((o) => o.status).sort()).toEqual(['accepted', 'withdrawn']);
      // Zed's request is someone else's trip: no request.updated for it.
      await expectQuiet(zedSocket);
    });

    it('goes to both on withdraw and on decline', async () => {
      const req = await setUp();
      const danOffer = await makeOffer(dan, req.id);
      const eveOffer = await makeOffer(eve, req.id);
      const [customer, danSocket, eveSocket] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(eve),
      ]);

      await api('post', `/offers/${danOffer.id}/withdraw`, dan).expect(200);
      expect((await danSocket.next('offer.updated')).offer).toMatchObject({ status: 'withdrawn' });
      expect((await customer.next('offer.updated')).offer).toMatchObject({
        id: danOffer.id,
        status: 'withdrawn',
      });

      await api('post', `/offers/${eveOffer.id}/decline`, alice).expect(200);
      expect((await eveSocket.next('offer.updated')).offer).toMatchObject({ status: 'declined' });
      expect((await customer.next('offer.updated')).offer).toMatchObject({
        id: eveOffer.id,
        status: 'declined',
      });
      await expectQuiet(danSocket, eveSocket);
    });

    it('goes to the drivers when the customer cancels their open request', async () => {
      const req = await setUp();
      const danOffer = await makeOffer(dan, req.id);
      const danSocket = await connect(dan);
      await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);
      expect((await danSocket.next('offer.updated')).offer).toEqual({
        ...danOffer,
        status: 'rejected',
      });
      // Dan was never assigned: the request itself is none of his business.
      await expectQuiet(danSocket);
    });
  });

  describe('nearby.changed', () => {
    const hint = { type: 'nearby.changed' };

    it('goes to online, fresh drivers in range when a request is created, and nobody else', async () => {
      await setUpPeople();
      // Eve is too far and Zed offline. Alice is the requester, though also online as a driver.
      await goOnline(eve, sousse);
      await api('put', '/driver/presence', zed).send({ online: false }).expect(200);
      await api('put', '/me/driver-profile', alice)
        .send({
          fullName: 'Alice Driver',
          phone: '+21698333333',
          truckType: 'flatbed',
          plateNumber: '1 TU 3',
        })
        .expect(200);
      await goOnline(alice, ariana);
      const [inRange, far, offline, customer] = await Promise.all([
        connect(dan),
        connect(eve),
        connect(zed),
        connect(alice),
      ]);

      await createRequest();

      expect(await inRange.next('nearby.changed')).toEqual(hint);
      await expectSilent(far, offline, customer);
    });

    it('is not sent to a driver whose location went stale', async () => {
      await setUpPeople();
      now = new Date(now.getTime() + PRESENCE_STALE_MS + 1_000);
      const driver = await connect(dan);
      await createRequest();
      await expectSilent(driver);
    });

    it('goes to the drivers in range when an offer is accepted, but not when the job is cancelled', async () => {
      const req = await setUp();
      const [danSocket, eveSocket] = await Promise.all([connect(dan), connect(eve)]);
      const danOffer = await makeOffer(dan, req.id);
      await danSocket.next('offer.updated');

      await api('post', `/offers/${danOffer.id}/accept`, alice).expect(200);
      expect(await eveSocket.next('nearby.changed')).toEqual(hint);

      await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);
      // Cancelling an assigned request does not change what is open.
      await expectSilent(eveSocket);
    });

    it('goes to the drivers in range when an open request is cancelled', async () => {
      const req = await setUp();
      const driver = await connect(eve);
      await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);
      expect(await driver.next('nearby.changed')).toEqual(hint);
    });

    it('goes to the drivers in range when a request expires, once', async () => {
      await setUp();
      const driver = await connect(eve);
      now = new Date(now.getTime() + 16 * 60_000);
      await goOnline(eve, ariana);
      await api('get', '/driver/requests/nearby', eve).expect(200);
      expect(await driver.next('nearby.changed')).toEqual(hint);
      await api('get', '/driver/requests/nearby', eve).expect(200);
      await expectSilent(driver);
    });
  });

  describe('driver.location', () => {
    it('goes to the customer only, with the ETA, on each presence update during a job', async () => {
      await assign();
      const [customer, driver, stranger] = await Promise.all([
        connect(alice),
        connect(dan),
        connect(zed),
      ]);
      now = new Date(now.getTime() + 5_000);

      await goOnline(dan, laMarsa);

      const message = await customer.next('driver.location');
      const active = towRequestSchema.parse(
        (await api('get', '/tow-requests/active', alice).expect(200)).body,
      );
      expect(message).toEqual({
        type: 'driver.location',
        requestId: active.id,
        location: laMarsa,
        etaMin: etaMinutes(estimateRoadDistanceM(laMarsa, tunis)),
      });
      expect(message.etaMin).toBe(active.etaMin);
      await expectQuiet(driver, stranger);
    });

    it('is not sent without a job', async () => {
      const req = await setUp();
      await makeOffer(dan, req.id);
      const customer = await connect(alice);
      await goOnline(dan, laMarsa);
      await expectQuiet(customer);
    });

    it('is not sent once the truck is at the pickup (there is no ETA)', async () => {
      await assign();
      await stage('en_route');
      await stage('arrived');
      const customer = await connect(alice);
      await goOnline(dan, tunis);
      await expectQuiet(customer);
    });

    it('is not sent for a presence update without a location', async () => {
      await assign();
      const customer = await connect(alice);
      await api('put', '/driver/presence', dan).send({ online: true }).expect(200);
      await expectQuiet(customer);
    });
  });
});
