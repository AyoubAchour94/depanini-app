import {
  estimateRoadDistanceM,
  OFFER_TTL_MS,
  type PushKind,
  pushDataSchema,
  suggestFare,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { deviceTokens, users } from '../src/db/schema.js';
import { TRIP_STAGE_BODIES } from '../src/push/messages.js';
import { NotificationsService } from '../src/push/notifications.service.js';
import type { PushSender } from '../src/push/push-sender.js';
import { approveDriverByToken } from './support/approve-driver.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';
import { connectAs, type TestSocket } from './support/ws-client.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };
const ariana = { latitude: 36.8625, longitude: 10.1956 };

const alice = 'token-alice:alice@example.com';
const bob = 'token-bob:bob@example.com';
const dan = 'token-dan:dan@example.com';
const eve = 'token-eve:eve@example.com';

type Method = 'get' | 'post' | 'put' | 'delete';

interface InboxPush {
  token: string;
  appVariant: 'user' | 'driver';
  title: string;
  body: string;
  collapseKey: string;
  data: { kind: PushKind; requestId: string; offerId?: string };
}

describe('push notifications (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');
  const sockets: TestSocket[] = [];

  const api = (method: Method, path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now, env: { PUSH_INBOX: true } });
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    await database.db.delete(users);
    await clearInbox();
  });

  afterEach(() => {
    for (const client of sockets.splice(0)) client.close();
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  /** Empties the inbox once the pushes still on their way have landed. */
  const clearInbox = async () => {
    await app.get(NotificationsService).flush();
    await api('delete', '/dev/push-inbox').expect(204);
  };
  const userId = async (token: string) => (await api('get', '/me', token).expect(200)).body.id;
  const device = (token: string, deviceToken: string, appVariant: 'user' | 'driver') =>
    api('put', '/me/devices', token)
      .send({ token: deviceToken, platform: 'android', appVariant })
      .expect(204);
  /** Every push to this person's devices, oldest first, each validated. */
  const inbox = async (token: string): Promise<InboxPush[]> => {
    await app.get(NotificationsService).flush();
    const res = await api('get', `/dev/push-inbox?userId=${await userId(token)}`).expect(200);
    for (const push of res.body as InboxPush[])
      expect(pushDataSchema.parse(push.data)).toEqual(push.data);
    return res.body;
  };
  const kinds = async (token: string) => (await inbox(token)).map((push) => push.data.kind);
  const connect = async (token: string) => {
    const client = await connectAs(app, token);
    sockets.push(client);
    return client;
  };

  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  /** Alice a customer; Dan and Eve online drivers near the pickup. Every person has a device. */
  const setUp = async () => {
    await api('put', '/me/customer-profile', alice)
      .send({ fullName: 'Alice Customer', phone: '+21698111111' })
      .expect(200);
    for (const [token, name, here] of [
      [dan, 'Dan Driver', laMarsa],
      [eve, 'Eve Driver', ariana],
    ] as const) {
      await api('put', '/me/driver-profile', token)
        .send({
          fullName: name,
          phone: '+21698222222',
          truckType: 'flatbed',
          plateNumber: '1 TU 2',
        })
        .expect(200);
      await approveDriverByToken(database.db, token);
      await api('put', '/driver/presence', token)
        .send({ online: true, location: here })
        .expect(200);
    }
    await device(alice, 'tok-alice', 'user');
    await device(dan, 'tok-dan', 'driver');
    await device(eve, 'tok-eve', 'driver');
  };
  const createRequest = async () =>
    (
      await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201)
    ).body.id as string;
  const makeOffer = async (token: string, requestId: string) =>
    (
      await api('post', `/tow-requests/${requestId}/offers`, token)
        .send({ fare: suggested })
        .expect(201)
    ).body.id as string;
  const stage = (to: string) =>
    api('post', '/driver/job/stage', dan).send({ stage: to }).expect(200);

  describe('devices', () => {
    it('needs a sign-in and a valid body', async () => {
      const body = { token: 't', platform: 'ios', appVariant: 'user' };
      await api('put', '/me/devices').send(body).expect(401);
      await api('delete', '/me/devices/t').expect(401);
      for (const bad of [
        {},
        { ...body, token: '' },
        { ...body, platform: 'web' },
        { ...body, appVariant: 'admin' },
      ]) {
        await api('put', '/me/devices', alice).send(bad).expect(400);
      }
      expect(await database.db.select().from(deviceTokens)).toEqual([]);
    });

    it('registers a token, and registering it again updates it', async () => {
      await api('put', '/me/devices', alice)
        .send({ token: 'tok-1', platform: 'ios', appVariant: 'user' })
        .expect(204);
      await api('put', '/me/devices', alice)
        .send({ token: 'tok-1', platform: 'android', appVariant: 'driver' })
        .expect(204);
      expect(await database.db.select().from(deviceTokens)).toMatchObject([
        { token: 'tok-1', platform: 'android', appVariant: 'driver' },
      ]);
    });

    it('moves a token to the account that registers it next', async () => {
      await device(alice, 'tok-shared', 'user');
      await device(bob, 'tok-shared', 'user');
      const rows = await database.db.select().from(deviceTokens);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(await userId(bob));
    });

    it("deletes the caller's own token only", async () => {
      await device(alice, 'tok-alice', 'user');
      await device(bob, 'tok-bob', 'user');
      await api('delete', '/me/devices/tok-bob', alice).expect(204);
      expect(await database.db.select().from(deviceTokens)).toHaveLength(2);
      await api('delete', '/me/devices/tok-alice', alice).expect(204);
      await api('delete', '/me/devices/tok-alice', alice).expect(204);
      expect(await database.db.select().from(deviceTokens)).toMatchObject([{ token: 'tok-bob' }]);
    });

    it('takes tokens with characters that need escaping', async () => {
      const token = 'abc:APA91b/x+y=';
      await device(alice, token, 'user');
      await api('delete', `/me/devices/${encodeURIComponent(token)}`, alice).expect(204);
      expect(await database.db.select().from(deviceTokens)).toEqual([]);
    });

    it('goes with the account', async () => {
      await device(alice, 'tok-alice', 'user');
      await device(alice, 'tok-alice-2', 'driver');
      await device(bob, 'tok-bob', 'user');
      await api('delete', '/me', alice).expect(204);
      expect(await database.db.select().from(deviceTokens)).toMatchObject([{ token: 'tok-bob' }]);
    });
  });

  describe('pushes', () => {
    it('tells the drivers in range about a new request, and no one else', async () => {
      await setUp();
      await api('put', '/driver/presence', eve).send({ online: false }).expect(200);
      const id = await createRequest();

      expect(await inbox(dan)).toMatchObject([
        {
          token: 'tok-dan',
          appVariant: 'driver',
          collapseKey: `offer:${id}`,
          data: { kind: 'nearby_request', requestId: id },
          title: expect.any(String),
          body: expect.any(String),
        },
      ]);
      expect(await inbox(eve)).toEqual([]);
      expect(await inbox(alice)).toEqual([]);
    });

    it('tells a driver out of range, or without a fresh location, nothing', async () => {
      await setUp();
      await api('put', '/driver/presence', dan)
        .send({ online: true, location: sousse })
        .expect(200);
      await createRequest();
      expect(await inbox(dan)).toEqual([]);
      expect(await kinds(eve)).toEqual(['nearby_request']);
    });

    it('does not push a request that is no longer open to the drivers nearby', async () => {
      await setUp();
      const id = await createRequest();
      const offer = await makeOffer(dan, id);
      await clearInbox();

      await api('post', `/offers/${offer}/accept`, alice).expect(200);
      expect(await inbox(eve)).toEqual([]);
      expect(await kinds(dan)).toEqual(['offer_accepted']);
    });

    it('does not push an expired request as new', async () => {
      await setUp();
      await createRequest();
      await clearInbox();
      now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await api('get', '/tow-requests/active', alice);
      await api('get', '/driver/requests/nearby', dan).expect(200);
      expect(await inbox(dan)).toEqual([]);
      expect(await inbox(eve)).toEqual([]);
    });

    it('walks a whole trip: offers, stages, completion, payment', async () => {
      await setUp();
      const id = await createRequest();
      await clearInbox();

      const danOffer = await makeOffer(dan, id);
      const eveOffer = await makeOffer(eve, id);
      const received = await inbox(alice);
      expect(received).toMatchObject([
        { appVariant: 'user', data: { kind: 'offer_received', requestId: id, offerId: danOffer } },
        { appVariant: 'user', data: { kind: 'offer_received', requestId: id, offerId: eveOffer } },
      ]);
      // A burst of offers collapses into one notification on the device.
      expect(new Set(received.map((push) => push.collapseKey))).toEqual(new Set([`offer:${id}`]));

      await api('post', `/offers/${danOffer}/accept`, alice).expect(200);
      expect(await inbox(dan)).toMatchObject([
        {
          collapseKey: `offer:${id}`,
          data: { kind: 'offer_accepted', requestId: id, offerId: danOffer },
        },
      ]);
      expect((await inbox(eve)).map((push) => push.data)).toEqual([
        { kind: 'offer_rejected', requestId: id, offerId: eveOffer },
      ]);
      expect(await kinds(alice)).toEqual(['offer_received', 'offer_received']);

      await clearInbox();
      for (const to of ['en_route', 'arrived', 'towing']) await stage(to);
      const stages = await inbox(alice);
      expect(stages.map((push) => push.data.kind)).toEqual([
        'trip_stage',
        'trip_stage',
        'trip_stage',
      ]);
      expect(new Set(stages.map((push) => push.collapseKey))).toEqual(new Set([`trip:${id}`]));
      expect(new Set(stages.map((push) => push.body)).size).toBe(3);
      expect(await inbox(dan)).toEqual([]);

      await clearInbox();
      await api('post', '/driver/job/complete', dan).send({ cashReceived: true }).expect(200);
      expect(await inbox(alice)).toMatchObject([
        { collapseKey: `trip:${id}`, data: { kind: 'trip_completed', requestId: id } },
      ]);
      expect(await inbox(dan)).toEqual([]);

      await api('post', `/tow-requests/${id}/payment/confirm`, alice).expect(200);
      expect(await inbox(dan)).toMatchObject([
        { collapseKey: `trip:${id}`, data: { kind: 'payment_answered', requestId: id } },
      ]);
      expect(await kinds(alice)).toEqual(['trip_completed']);
    });

    it('tells the driver when the customer declines, and when an offer lapses', async () => {
      await setUp();
      const id = await createRequest();
      const danOffer = await makeOffer(dan, id);
      const eveOffer = await makeOffer(eve, id);
      await clearInbox();

      await api('post', `/offers/${eveOffer}/decline`, alice).expect(200);
      expect((await inbox(eve)).map((push) => push.data)).toEqual([
        { kind: 'offer_rejected', requestId: id, offerId: eveOffer },
      ]);

      now = new Date(now.getTime() + OFFER_TTL_MS + 1000);
      await api('get', '/driver/offers/active', dan).expect(200);
      expect((await inbox(dan)).map((push) => push.data)).toEqual([
        { kind: 'offer_expired', requestId: id, offerId: danOffer },
      ]);
      // Reading again flips nothing, so nothing is pushed twice.
      await api('get', '/driver/offers/active', dan).expect(200);
      expect(await kinds(dan)).toEqual(['offer_expired']);
    });

    it('does not push a withdrawn offer', async () => {
      await setUp();
      const id = await createRequest();
      const danOffer = await makeOffer(dan, id);
      await clearInbox();
      await api('post', `/offers/${danOffer}/withdraw`, dan).expect(200);
      expect(await inbox(dan)).toEqual([]);
      expect(await inbox(alice)).toEqual([]);
    });

    it('tells the driver when the customer cancels, and the customer when the driver does', async () => {
      await setUp();
      let id = await createRequest();
      await api('post', `/offers/${await makeOffer(dan, id)}/accept`, alice).expect(200);
      await clearInbox();

      await api('post', `/tow-requests/${id}/cancel`, alice).send({}).expect(200);
      expect(await inbox(dan)).toMatchObject([
        { collapseKey: `trip:${id}`, data: { kind: 'trip_cancelled', requestId: id } },
      ]);
      expect(await inbox(alice)).toEqual([]);

      await clearInbox();
      id = await createRequest();
      await api('post', `/offers/${await makeOffer(dan, id)}/accept`, alice).expect(200);
      await clearInbox();
      await api('post', `/tow-requests/${id}/cancel`, dan)
        .send({ reason: 'truck_problem' })
        .expect(200);
      expect(await inbox(alice)).toMatchObject([
        { collapseKey: `trip:${id}`, data: { kind: 'trip_cancelled', requestId: id } },
      ]);
      expect(await inbox(dan)).toEqual([]);
    });

    it("tells the customer when the driver's account is deleted mid-trip", async () => {
      await setUp();
      const id = await createRequest();
      await api('post', `/offers/${await makeOffer(dan, id)}/accept`, alice).expect(200);
      await clearInbox();
      await api('delete', '/me', dan).expect(204);
      expect(await kinds(alice)).toEqual(['trip_cancelled']);
    });

    it('tells the drivers whose offers are pending when the customer cancels the request', async () => {
      await setUp();
      const id = await createRequest();
      const danOffer = await makeOffer(dan, id);
      await clearInbox();
      await api('post', `/tow-requests/${id}/cancel`, alice).send({}).expect(200);
      const pushes = await inbox(dan);
      expect(pushes.map((push) => push.data)).toEqual([
        { kind: 'trip_cancelled', requestId: id, offerId: danOffer },
      ]);
      expect(pushes[0]!.body).toBe('The customer cancelled this request.');
      expect(await inbox(alice)).toEqual([]);
    });

    it('says what the stage was when two changes follow each other, in order', async () => {
      await setUp();
      const id = await createRequest();
      await api('post', `/offers/${await makeOffer(dan, id)}/accept`, alice).expect(200);
      await clearInbox();

      // No flush in between: the second change is made before the first push has gone out.
      await stage('en_route');
      await stage('arrived');
      const stages = await inbox(alice);
      expect(stages.map((push) => [push.data.kind, push.body])).toEqual([
        ['trip_stage', TRIP_STAGE_BODIES.en_route],
        ['trip_stage', TRIP_STAGE_BODIES.arrived],
      ]);
    });

    it('sends driver events to driver tokens and customer events to user tokens only', async () => {
      await setUp();
      // Dan also has the customer app, Alice also has the driver app.
      await device(dan, 'tok-dan-user', 'user');
      await device(alice, 'tok-alice-driver', 'driver');
      const id = await createRequest();
      await api('post', `/offers/${await makeOffer(dan, id)}/accept`, alice).expect(200);
      await stage('en_route');

      const forAlice = await inbox(alice);
      expect(forAlice.map((push) => [push.token, push.data.kind])).toEqual([
        ['tok-alice', 'offer_received'],
        ['tok-alice', 'trip_stage'],
      ]);
      const forDan = await inbox(dan);
      expect(forDan.map((push) => [push.token, push.data.kind])).toEqual([
        ['tok-dan', 'nearby_request'],
        ['tok-dan', 'offer_accepted'],
      ]);
    });

    it('sends to every device of the person', async () => {
      await setUp();
      await device(alice, 'tok-alice-2', 'user');
      const id = await createRequest();
      await makeOffer(dan, id);
      expect((await inbox(alice)).map((push) => push.token).sort()).toEqual([
        'tok-alice',
        'tok-alice-2',
      ]);
    });

    it('sends nothing to a person without a device', async () => {
      await setUp();
      await api('delete', '/me/devices/tok-alice', alice).expect(204);
      const id = await createRequest();
      await makeOffer(dan, id);
      expect(await inbox(alice)).toEqual([]);
    });

    it('skips a person with a live socket, and pushes again once it is closed', async () => {
      await setUp();
      const aliceSocket = await connect(alice);
      const danSocket = await connect(dan);
      const id = await createRequest();
      const danOffer = await makeOffer(dan, id);
      expect(await inbox(alice)).toEqual([]);
      expect(await inbox(dan)).toEqual([]);
      // Eve is not connected, so she still hears of the request.
      expect(await kinds(eve)).toEqual(['nearby_request']);

      await api('post', `/offers/${danOffer}/accept`, alice).expect(200);
      await stage('en_route');
      expect(await inbox(alice)).toEqual([]);
      expect(await inbox(dan)).toEqual([]);

      aliceSocket.close();
      await aliceSocket.closed;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await stage('arrived');
      expect(await kinds(alice)).toEqual(['trip_stage']);
      expect(await inbox(dan)).toEqual([]);

      danSocket.close();
      await danSocket.closed;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await api('post', `/tow-requests/${id}/cancel`, alice).send({ reason: 'other' }).expect(200);
      expect(await kinds(dan)).toEqual(['trip_cancelled']);
    });
  });

  describe('inbox', () => {
    it('keeps what was pushed until it is cleared', async () => {
      await setUp();
      await createRequest();
      expect(await kinds(dan)).toEqual(['nearby_request']);
      await clearInbox();
      expect(await kinds(dan)).toEqual([]);
    });

    it('answers an empty list for a user with no pushes or no id', async () => {
      await api('get', '/dev/push-inbox').expect(200, []);
      await api('get', '/dev/push-inbox?userId=nobody').expect(200, []);
    });
  });

  describe('a sender that fails', () => {
    let failing: NestFastifyApplication;
    const attempts: string[] = [];

    beforeAll(async () => {
      const sender: PushSender = {
        send: async (_tokens, { data }) => {
          attempts.push(data.kind);
          throw new Error('FCM is down');
        },
      };
      failing = await createTestApp(database.db, { now: () => now, pushSender: sender });
    });

    afterAll(async () => {
      await failing.close();
    });

    it('never fails the request that caused the push', async () => {
      const call = (method: Method, path: string, token: string) =>
        request(failing.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
      await call('put', '/me/customer-profile', alice)
        .send({ fullName: 'Alice Customer', phone: '+21698111111' })
        .expect(200);
      await call('put', '/me/driver-profile', dan)
        .send({
          fullName: 'Dan Driver',
          phone: '+21698222222',
          truckType: 'flatbed',
          plateNumber: '1 TU 2',
        })
        .expect(200);
      await approveDriverByToken(database.db, dan);
      await call('put', '/driver/presence', dan)
        .send({ online: true, location: laMarsa })
        .expect(200);
      for (const [token, deviceToken, appVariant] of [
        [alice, 'tok-alice', 'user'],
        [dan, 'tok-dan', 'driver'],
      ] as const) {
        await call('put', '/me/devices', token)
          .send({ token: deviceToken, platform: 'ios', appVariant })
          .expect(204);
      }

      const created = await call('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201);
      const offer = await call('post', `/tow-requests/${created.body.id}/offers`, dan)
        .send({ fare: suggested })
        .expect(201);
      await call('post', `/offers/${offer.body.id}/accept`, alice).expect(200);
      await failing.get(NotificationsService).flush();
      expect(attempts).toEqual(['nearby_request', 'offer_received', 'offer_accepted']);
    });
  });

  describe('the inbox is not available', () => {
    const closed = async (env: Parameters<typeof createTestApp>[1] extends infer O ? O : never) => {
      const other = await createTestApp(database.db, env);
      try {
        const call = (method: Method, path: string) => request(other.getHttpServer())[method](path);
        for (const [method, path] of [
          ['get', '/dev/push-inbox'],
          ['get', '/dev/push-inbox?userId=x'],
          ['delete', '/dev/push-inbox'],
        ] as const) {
          const res = await call(method, path).expect(404);
          expect(res.body).toMatchObject({
            statusCode: 404,
            error: 'Not Found',
            message: `Cannot ${method.toUpperCase()} ${path}`,
          });
        }
      } finally {
        await other.close();
      }
    };

    it('is off unless PUSH_INBOX is 1', async () => {
      await closed({ env: { PUSH_INBOX: false } });
    });

    it('is off in production, whatever PUSH_INBOX says', async () => {
      await closed({ env: { NODE_ENV: 'production', PUSH_INBOX: true } });
    });

    it('is off when pushes do not go to the log sender', async () => {
      await closed({
        env: { PUSH_INBOX: true },
        pushSender: { send: async () => undefined },
      });
    });
  });

  it('keeps its test data apart: a token of a deleted account is gone', async () => {
    await device(alice, 'tok-alice', 'user');
    const id = await userId(alice);
    await database.db.delete(users).where(eq(users.id, id));
    expect(await database.db.select().from(deviceTokens)).toEqual([]);
  });
});
