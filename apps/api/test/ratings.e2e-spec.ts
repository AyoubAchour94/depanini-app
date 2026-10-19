import {
  customerOfferSchema,
  estimateRoadDistanceM,
  myRatingSchema,
  nearbyRequestSchema,
  RATING_NEW_THRESHOLD,
  RATING_WINDOW_DAYS,
  suggestFare,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { z } from 'zod';

import { ratings, towRequests, users } from '../src/db/schema.js';
import * as schema from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase, TEST_DATABASE_URL } from './support/test-database.js';
import { openSocket, type TestSocket } from './support/ws-client.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };

const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET = 'the comment only its author may read';

describe('ratings (e2e)', () => {
  const database = connectTestDatabase();
  // A second pool whose queries are counted, behind the app.
  const countedPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const counted = drizzle(countedPool, { schema });
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');

  beforeAll(async () => {
    app = await createTestApp(counted, { now: () => now });
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await countedPool.end();
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const bob = 'token-bob:bob@example.com';
  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';
  const zed = 'token-zed:zed@example.com';

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  const customerProfile = (token: string, name: string) =>
    api('put', '/me/customer-profile', token)
      .send({ fullName: name, phone: '+21698111111' })
      .expect(200);
  const driverProfile = (token: string, name: string, plate: string) =>
    api('put', '/me/driver-profile', token)
      .send({ fullName: name, phone: '+21698222222', truckType: 'flatbed', plateNumber: plate })
      .expect(200);
  const online = (driver: string) =>
    api('put', '/driver/presence', driver).send({ online: true, location: laMarsa }).expect(200);

  /** A new request by `customer`. */
  const open = async (customer: string) =>
    (
      await api('post', '/tow-requests', customer)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201)
    ).body.id as string;
  const offer = async (driver: string, requestId: string) =>
    (
      await api('post', `/tow-requests/${requestId}/offers`, driver)
        .send({ fare: suggested })
        .expect(201)
    ).body.id as string;

  /** A trip of `customer` with `driver`, taken to `completed` (and paid for). Returns its id. */
  const trip = async (customer: string, driver: string) => {
    await online(driver);
    const id = await open(customer);
    await api('post', `/offers/${await offer(driver, id)}/accept`, customer).expect(200);
    for (const stage of ['en_route', 'arrived', 'towing']) {
      await api('post', '/driver/job/stage', driver).send({ stage }).expect(200);
    }
    await api('post', '/driver/job/complete', driver).send({ cashReceived: true }).expect(200);
    await api('post', `/tow-requests/${id}/payment/confirm`, customer).expect(200);
    return id;
  };

  const rate = (id: string, token: string, body: unknown) =>
    api('post', `/tow-requests/${id}/rating`, token).send(body as object);
  const good = { stars: 5, tags: ['on_time'], comment: SECRET };

  const setUp = async () => {
    await customerProfile(alice, 'Alice Customer');
    await customerProfile(bob, 'Bob Customer');
    await customerProfile(zed, 'Zed Customer');
    await driverProfile(dan, 'Dan Driver', 'DAN 1');
    await driverProfile(eve, 'Eve Driver', 'EVE 1');
  };

  describe('POST /tow-requests/:id/rating', () => {
    it('needs a sign-in, and a known trip of the caller', async () => {
      await setUp();
      const id = await trip(alice, dan);
      await api('post', `/tow-requests/${id}/rating`).send(good).expect(401);
      await rate(id, zed, good).expect(404);
      await rate(id, eve, { stars: 5 }).expect(404);
      await rate(id, bob, good).expect(404);
      await rate('4a4cbd7c-6cb8-4a6a-8f4d-3a8d7b0cf2f1', alice, good).expect(404);
      await rate('not-a-uuid', alice, good).expect(404);
      await api('get', `/tow-requests/${id}/rating`, zed).expect(404);
      expect(await database.db.select().from(ratings)).toHaveLength(0);
    });

    it('saves the customer rating of the driver, once', async () => {
      await setUp();
      const id = await trip(alice, dan);
      const res = await rate(id, alice, good).expect(201);
      expect(myRatingSchema.parse(res.body)).toMatchObject({
        mine: { stars: 5, tags: ['on_time'], comment: SECRET },
        otherSideRated: false,
        canRate: false,
      });
      const [saved] = await database.db.select().from(ratings);
      expect(saved).toMatchObject({ raterRole: 'customer', stars: 5, comment: SECRET });
      const [danRow] = await database.db.select().from(users).where(eq(users.firebaseUid, 'dan'));
      expect(saved?.rateeUserId).toBe(danRow?.id);

      await rate(id, alice, { stars: 1, tags: ['rude'] }).expect(409);
      expect(await database.db.select().from(ratings)).toHaveLength(1);
    });

    it('saves the driver rating of the customer, once, independent of the customer one', async () => {
      await setUp();
      const id = await trip(alice, dan);
      await rate(id, alice, good).expect(201);
      const res = await rate(id, dan, { stars: 2, tags: ['made_me_wait'] }).expect(201);
      expect(myRatingSchema.parse(res.body)).toMatchObject({
        mine: { stars: 2, tags: ['made_me_wait'], comment: null },
        otherSideRated: true,
        canRate: false,
      });
      await rate(id, dan, { stars: 5 }).expect(409);
      const rows = await database.db.select().from(ratings);
      expect(rows.map((r) => r.raterRole).sort()).toEqual(['customer', 'driver']);
    });

    it('validates with the side of the caller', async () => {
      await setUp();
      const id = await trip(alice, dan);
      // The customer's tags are not the driver's and the other way round.
      await rate(id, alice, { stars: 5, tags: ['clear_location'] }).expect(400);
      await rate(id, dan, { stars: 5, tags: ['on_time'] }).expect(400);
      await rate(id, dan, { stars: 5, tags: ['friendly', 'rude'] }).expect(201);
    });

    it('rejects bad stars, tags and comments with 400 and saves nothing', async () => {
      await setUp();
      const id = await trip(alice, dan);
      for (const body of [
        {},
        { stars: 0 },
        { stars: 6 },
        { stars: 4.5 },
        { stars: '5' },
        { stars: 5, tags: ['on_time', 'on_time'] },
        { stars: 5, tags: ['nope'] },
        { stars: 5, comment: 'x'.repeat(301) },
        // 1 and 2 stars need a tag.
        { stars: 1 },
        { stars: 2, tags: [] },
      ]) {
        await rate(id, alice, body).expect(400);
      }
      expect(await database.db.select().from(ratings)).toHaveLength(0);
      await rate(id, alice, { stars: 2, tags: ['late'] }).expect(201);
    });

    it('stores a blank comment as none', async () => {
      await setUp();
      const id = await trip(alice, dan);
      await rate(id, alice, { stars: 4, comment: '   ' }).expect(201);
      expect((await database.db.select().from(ratings))[0]?.comment).toBeNull();
    });

    it('answers 409 until the trip is completed', async () => {
      await setUp();
      await online(dan);
      const id = await open(alice);
      await rate(id, alice, good).expect(409);
      await api('post', `/offers/${await offer(dan, id)}/accept`, alice).expect(200);
      await rate(id, alice, good).expect(409);
      await rate(id, dan, { stars: 5 }).expect(409);
      await api('get', `/tow-requests/${id}/rating`, alice).expect(409);
      // A cancelled trip is never rated.
      await api('post', `/tow-requests/${id}/cancel`, alice).send({}).expect(200);
      await rate(id, alice, good).expect(409);
      expect(await database.db.select().from(ratings)).toHaveLength(0);
    });

    it('answers 409 for a request that was never assigned (no driver to rate)', async () => {
      await setUp();
      const id = await open(alice);
      await rate(id, alice, good).expect(409);
    });

    it('is open for 7 days from completion, inclusive, by the clock', async () => {
      await setUp();
      const id = await trip(alice, dan);
      const [done] = await database.db.select().from(towRequests).where(eq(towRequests.id, id));
      const deadline = done!.completedAt!.getTime() + RATING_WINDOW_DAYS * DAY_MS;

      now = new Date(deadline);
      await rate(id, alice, good).expect(201);

      now = new Date(deadline + 1);
      await rate(id, dan, { stars: 5 }).expect(409);
      expect(await database.db.select().from(ratings)).toHaveLength(1);
    });

    it('answers 409 when the driver account was deleted', async () => {
      await setUp();
      const id = await trip(alice, dan);
      await api('delete', '/me', dan).expect(204);
      const [after] = await database.db.select().from(towRequests).where(eq(towRequests.id, id));
      expect(after?.assignedDriverId).toBeNull();
      await rate(id, alice, good).expect(409);
      const view = await api('get', `/tow-requests/${id}/rating`, alice).expect(200);
      expect(view.body.canRate).toBe(false);
    });

    it('answers 404 to the driver once the customer account (and its trips) is deleted', async () => {
      await setUp();
      const id = await trip(alice, dan);
      await api('delete', '/me', alice).expect(204);
      // The customer's requests go with the account, so the driver's party check fails.
      await rate(id, dan, { stars: 5 }).expect(404);
    });

    it('publishes nothing on the WebSocket', async () => {
      await setUp();
      const id = await trip(alice, dan);
      const sockets: TestSocket[] = [];
      for (const token of [alice, dan]) {
        const socket = await openSocket(app);
        socket.send({ type: 'auth', token });
        await socket.next('auth.ok');
        sockets.push(socket);
      }
      await rate(id, alice, good).expect(201);
      await rate(id, dan, { stars: 5 }).expect(201);
      await new Promise((resolve) => setTimeout(resolve, 150));
      for (const socket of sockets) {
        expect(socket.inbox).toEqual([]);
        socket.close();
      }
    });
  });

  describe('GET /tow-requests/:id/rating', () => {
    it('shows my rating, whether they rated, never their stars, and the deadline', async () => {
      await setUp();
      const id = await trip(alice, dan);
      const [done] = await database.db.select().from(towRequests).where(eq(towRequests.id, id));
      const deadline = new Date(done!.completedAt!.getTime() + RATING_WINDOW_DAYS * DAY_MS);

      const fresh = await api('get', `/tow-requests/${id}/rating`, alice).expect(200);
      expect(myRatingSchema.parse(fresh.body)).toEqual({
        mine: null,
        otherSideRated: false,
        canRate: true,
        deadline: deadline.toISOString(),
      });

      await rate(id, dan, { stars: 1, tags: ['rude'], comment: 'dan only' }).expect(201);
      const customerView = await api('get', `/tow-requests/${id}/rating`, alice).expect(200);
      expect(customerView.body).toEqual({
        mine: null,
        otherSideRated: true,
        canRate: true,
        deadline: deadline.toISOString(),
      });
      expect(JSON.stringify(customerView.body)).not.toContain('dan only');

      await rate(id, alice, good).expect(201);
      const driverView = await api('get', `/tow-requests/${id}/rating`, dan).expect(200);
      expect(driverView.body).toMatchObject({
        mine: { stars: 1, tags: ['rude'], comment: 'dan only' },
        otherSideRated: true,
        canRate: false,
      });
      expect(JSON.stringify(driverView.body)).not.toContain(SECRET);
    });

    it('closes canRate with the window', async () => {
      await setUp();
      const id = await trip(alice, dan);
      now = new Date(now.getTime() + (RATING_WINDOW_DAYS + 1) * DAY_MS);
      const view = await api('get', `/tow-requests/${id}/rating`, alice).expect(200);
      expect(view.body.canRate).toBe(false);
    });
  });

  describe('summaries', () => {
    /** `n` completed trips of `customer` with `driver`, each rated `stars` by the customer. */
    const ratedByCustomer = async (customer: string, driver: string, stars: number[]) => {
      for (const s of stars) {
        const id = await trip(customer, driver);
        await rate(id, customer, {
          stars: s,
          tags: s <= 2 ? ['late'] : [],
          comment: SECRET,
        }).expect(201);
      }
    };
    const customerOffers = async (requestId: string, token = alice) =>
      z
        .array(customerOfferSchema)
        .parse((await api('get', `/tow-requests/${requestId}/offers`, token).expect(200)).body);

    it('shows the count and no average below the threshold, then the rounded average', async () => {
      await setUp();
      const first = await open(alice);
      expect((await customerOffers(first)).length).toBe(0);
      await api('post', `/tow-requests/${first}/cancel`, alice).send({}).expect(200);

      await ratedByCustomer(alice, dan, [5, 4]);
      expect(RATING_NEW_THRESHOLD).toBe(3);
      await online(dan);
      const second = await open(alice);
      await offer(dan, second);
      expect((await customerOffers(second))[0]?.driver.rating).toEqual({ average: null, count: 2 });
      await api('post', `/tow-requests/${second}/cancel`, alice).send({}).expect(200);

      // 5 + 4 + 4 = 13 / 3 = 4.33.. -> 4.3
      await ratedByCustomer(alice, dan, [4]);
      await online(dan);
      const third = await open(alice);
      await offer(dan, third);
      expect((await customerOffers(third))[0]?.driver.rating).toEqual({ average: 4.3, count: 3 });
    });

    it('counts only customer ratings of that driver, and not the driver ratings of customers', async () => {
      await setUp();
      await ratedByCustomer(alice, dan, [5, 5, 5]);
      // Dan rating Alice, and Bob rating Eve, must not move Dan's number.
      const id = await trip(bob, dan);
      await rate(id, dan, { stars: 1, tags: ['rude'] }).expect(201);
      const other = await trip(bob, eve);
      await rate(other, bob, { stars: 1, tags: ['late'] }).expect(201);

      await online(dan);
      await online(eve);
      const next = await open(alice);
      await offer(dan, next);
      await offer(eve, next);
      const offers = await customerOffers(next);
      const byName = Object.fromEntries(offers.map((o) => [o.driver.fullName, o.driver.rating]));
      expect(byName).toEqual({
        'Dan Driver': { average: 5, count: 3 },
        'Eve Driver': { average: null, count: 1 },
      });
    });

    it('carries the driver rating on offer.updated and never a comment', async () => {
      await setUp();
      await ratedByCustomer(alice, dan, [5, 4, 4]);
      await online(dan);
      const id = await open(alice);
      const socket = await openSocket(app);
      socket.send({ type: 'auth', token: alice });
      await socket.next('auth.ok');
      await offer(dan, id);
      const message = await socket.next('offer.updated');
      expect(customerOfferSchema.parse(message.offer).driver.rating).toEqual({
        average: 4.3,
        count: 3,
      });
      expect(JSON.stringify(message)).not.toContain(SECRET);
      socket.close();
    });

    it('shows the customer rating on nearby requests: driver ratings only, count below threshold', async () => {
      await setUp();
      const nearby = async (token: string) =>
        z
          .array(nearbyRequestSchema)
          .parse((await api('get', '/driver/requests/nearby', token).expect(200)).body);

      // Dan rates Alice three times (2, 4, 5 = 3.7) and Eve rates Bob once.
      for (const [stars, tags] of [
        [2, ['made_me_wait']],
        [4, []],
        [5, []],
      ] as const) {
        const id = await trip(alice, dan);
        await rate(id, dan, { stars, tags: [...tags], comment: SECRET }).expect(201);
        // Alice rating Dan does not count for Alice.
        await rate(id, alice, { stars: 1, tags: ['rude'] }).expect(201);
      }
      const bobTrip = await trip(bob, eve);
      await rate(bobTrip, eve, { stars: 5 }).expect(201);

      await online(eve);
      await open(alice);
      await open(bob);
      await open(zed);
      const list = await nearby(eve);
      expect(list).toHaveLength(3);
      const stars = list.map((r) => r.customer?.rating).sort((a, b) => a!.count - b!.count);
      expect(stars).toEqual([
        { average: null, count: 0 },
        { average: null, count: 1 },
        { average: 3.7, count: 3 },
      ]);
      expect(JSON.stringify(list)).not.toContain(SECRET);
    });

    it('never leaks a comment through offers, nearby, trips or history', async () => {
      await setUp();
      const id = await trip(alice, dan);
      await rate(id, alice, good).expect(201);
      await rate(id, dan, { stars: 5, comment: 'driver secret' }).expect(201);
      const bodies = await Promise.all([
        api('get', '/tow-requests', alice),
        api('get', `/tow-requests/${id}`, alice),
        api('get', `/tow-requests/${id}/receipt`, alice),
        api('get', `/tow-requests/${id}/receipt`, dan),
        api('get', '/driver/jobs', dan),
        api('get', '/driver/earnings', dan),
        api('get', '/driver/requests/nearby', dan),
        api('get', '/me', alice),
        api('get', '/me', dan),
      ]);
      for (const res of bodies) {
        expect(JSON.stringify(res.body)).not.toContain('secret');
        expect(JSON.stringify(res.body)).not.toContain(SECRET);
      }
    });

    it('answers a list with the same number of queries whatever its size', async () => {
      await setUp();
      // Dan and Eve both rated, so both summaries are real.
      await ratedByCustomer(alice, dan, [5]);
      await ratedByCustomer(alice, eve, [5]);
      await online(dan);
      await online(eve);
      const id = await open(alice);
      await offer(dan, id);

      const spy = vi.spyOn(countedPool, 'query');
      const queriesFor = async () => {
        spy.mockClear();
        await customerOffers(id);
        return spy.mock.calls.length;
      };
      const one = await queriesFor();
      await offer(eve, id);
      expect((await customerOffers(id)).length).toBe(2);
      const two = await queriesFor();
      spy.mockRestore();
      expect(two).toBe(one);
    });
  });

  describe('account deletion', () => {
    it('removes the ratings a user gave and received', async () => {
      await setUp();
      const id = await trip(alice, dan);
      await rate(id, alice, good).expect(201);
      await rate(id, dan, { stars: 5 }).expect(201);
      const other = await trip(bob, dan);
      await rate(other, bob, good).expect(201);
      await api('delete', '/me', alice).expect(204);
      const left = await database.db.select().from(ratings);
      expect(left.map((r) => r.requestId)).toEqual([other]);
    });
  });
});
