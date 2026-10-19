import {
  customerOfferSchema,
  driverJobSchema,
  estimateRoadDistanceM,
  etaMinutes,
  fareBounds,
  haversineM,
  nearbyRequestSchema,
  OFFER_TTL_MS,
  offerSchema,
  ROAD_FACTOR,
  suggestFare,
  towRequestSchema,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { z } from 'zod';

import { towOffers, towRequests, users } from '../src/db/schema.js';
import { approveDriverByToken } from './support/approve-driver.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 }; // ~15 km from Tunis
const ariana = { latitude: 36.8625, longitude: 10.1956 }; // ~6 km from Tunis
const NEW = { average: null, count: 0 };
const sfax = { latitude: 34.74, longitude: 10.76 }; // out of range

const unknownId = '00000000-0000-4000-8000-000000000000';

describe('offers, accept/decline and driver job (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');
  const secondsLater = (seconds: number) => {
    now = new Date(now.getTime() + seconds * 1000);
  };

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now });
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    // Profiles, presence, requests and offers go with their account (cascade).
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  // Customers
  const alice = 'token-alice:alice@example.com';
  const bob = 'token-bob:bob@example.com';
  // Drivers
  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const makeCustomer = (token: string, fullName = 'Alice Customer') =>
    api('put', '/me/customer-profile', token).send({ fullName, phone: '+21698111111' }).expect(200);
  const makeDriver = async (token: string, fullName = 'Dan Driver', truckType = 'flatbed') => {
    await api('put', '/me/driver-profile', token)
      .send({ fullName, phone: '+21698222222', truckType, plateNumber: '123 tun 4567' })
      .expect(200);
    await approveDriverByToken(database.db, token);
  };
  const goOnline = (token: string, location: { latitude: number; longitude: number } = laMarsa) =>
    api('put', '/driver/presence', token).send({ online: true, location }).expect(200);

  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');
  /** An open request by `token`, picking up in Tunis. */
  const createRequest = async (token: string, pickup = tunis) => {
    const res = await api('post', '/tow-requests', token)
      .send({
        pickup,
        dropoff: sousse,
        vehicleType: 'car',
        problemType: 'breakdown',
        proposedFare: suggested,
      })
      .expect(201);
    return towRequestSchema.parse(res.body);
  };
  const postOffer = (token: string, requestId: string, fare: number) =>
    api('post', `/tow-requests/${requestId}/offers`, token).send({ fare });
  const makeOffer = async (token: string, requestId: string, fare = suggested) => {
    const res = await postOffer(token, requestId, fare).expect(201);
    return offerSchema.parse(res.body);
  };
  const offerStatus = async (id: string) => {
    const [row] = await database.db
      .select({ status: towOffers.status })
      .from(towOffers)
      .where(eq(towOffers.id, id));
    return row!.status;
  };
  const requestRow = async (id: string) => {
    const [row] = await database.db.select().from(towRequests).where(eq(towRequests.id, id));
    return row!;
  };
  const accountId = async (token: string) => {
    const uid = token.split(':')[0]!.replace('token-', '');
    const [row] = await database.db.select().from(users).where(eq(users.firebaseUid, uid));
    return row!.id;
  };

  /** Alice has an open request; Dan (and Eve, when asked) are online nearby. */
  const setUp = async ({ withEve = false } = {}) => {
    await makeCustomer(alice);
    await makeDriver(dan);
    await goOnline(dan);
    if (withEve) {
      await makeDriver(eve, 'Eve Driver', 'wheel_lift');
      await goOnline(eve, ariana);
    }
    return createRequest(alice);
  };

  describe('POST /tow-requests/:id/offers', () => {
    it('rejects a request without a token', async () => {
      await api('post', `/tow-requests/${unknownId}/offers`).send({ fare: 100 }).expect(401);
    });

    it('needs a driver profile', async () => {
      await makeCustomer(alice);
      const req = await createRequest(alice);
      await makeCustomer(bob);
      await postOffer(bob, req.id, suggested).expect(403);
    });

    it("makes a pending offer at the customer's fare, with distance, ETA and expiry", async () => {
      const req = await setUp();

      const offer = await makeOffer(dan, req.id);

      const expected = haversineM(tunis, laMarsa) * ROAD_FACTOR;
      expect(Math.abs(offer.distanceToPickupM - expected)).toBeLessThan(expected * 0.01);
      expect(offer).toMatchObject({
        requestId: req.id,
        fare: suggested,
        status: 'pending',
        etaMin: etaMinutes(offer.distanceToPickupM),
        expiresAt: new Date(now.getTime() + OFFER_TTL_MS).toISOString(),
        createdAt: now.toISOString(),
      });
      const res = await api('get', '/driver/requests/nearby', dan).expect(200);
      const [item] = z.array(nearbyRequestSchema).parse(res.body);
      expect(item!.myOffer).toEqual(offer);
    });

    it('accepts a counter within the fare bounds and rejects one outside them', async () => {
      const req = await setUp({ withEve: true });
      const { min, max } = fareBounds(req.suggestedFare);

      const res = await postOffer(dan, req.id, min - 1).expect(400);
      expect(res.body.issues).toEqual([{ path: ['fare'], message: expect.any(String) }]);
      await postOffer(dan, req.id, max + 1).expect(400);
      await postOffer(dan, req.id, 10.5).expect(400);

      expect((await makeOffer(dan, req.id, min)).fare).toBe(min);
      expect((await makeOffer(eve, req.id, max)).fare).toBe(max);
    });

    it('is 404 for an unknown or malformed request', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      await postOffer(dan, unknownId, 100).expect(404);
      await postOffer(dan, 'nope', 100).expect(404);
    });

    it("is 404 for the driver's own request", async () => {
      await makeDriver(dan);
      await makeCustomer(dan);
      await goOnline(dan);
      const req = await createRequest(dan);
      await postOffer(dan, req.id, suggested).expect(404);
    });

    it('is 409 when the driver is offline or their location is stale', async () => {
      const req = await setUp();
      await api('put', '/driver/presence', dan).send({ online: false }).expect(200);
      await postOffer(dan, req.id, suggested).expect(409);

      await goOnline(dan);
      secondsLater(121);
      await postOffer(dan, req.id, suggested).expect(409);
    });

    it('is 409 when the pickup is out of range', async () => {
      const req = await setUp();
      await goOnline(dan, sfax);
      await postOffer(dan, req.id, suggested).expect(409);
    });

    it('is 409 for a cancelled or expired request', async () => {
      const req = await setUp();
      await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);
      await postOffer(dan, req.id, suggested).expect(409);

      const fresh = await createRequest(alice);
      secondsLater(15 * 60);
      await goOnline(dan);
      await postOffer(dan, fresh.id, suggested).expect(409);
      expect((await requestRow(fresh.id)).status).toBe('expired');
    });

    it('is 409 for a second pending offer on the same request, but allows one after withdrawing', async () => {
      const req = await setUp();
      const first = await makeOffer(dan, req.id);
      await postOffer(dan, req.id, suggested + 1).expect(409);

      await api('post', `/offers/${first.id}/withdraw`, dan).expect(200);
      await makeOffer(dan, req.id, suggested + 1);
    });

    it('allows a new offer once the previous one expired', async () => {
      const req = await setUp();
      await makeOffer(dan, req.id);
      secondsLater(OFFER_TTL_MS / 1000);
      await goOnline(dan);
      await makeOffer(dan, req.id);
    });

    it('is 409 while the driver has a job', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);

      await makeCustomer(bob);
      const other = await createRequest(bob);
      await postOffer(dan, other.id, suggested).expect(409);
    });
  });

  describe('POST /offers/:id/withdraw', () => {
    it('withdraws a pending offer', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);

      const res = await api('post', `/offers/${offer.id}/withdraw`, dan).expect(200);

      expect(offerSchema.parse(res.body)).toEqual({ ...offer, status: 'withdrawn' });
      const offers = await api('get', `/tow-requests/${req.id}/offers`, alice).expect(200);
      expect(offers.body).toEqual([]);
    });

    it("is 404 for another driver's offer or an unknown id", async () => {
      const req = await setUp({ withEve: true });
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/withdraw`, eve).expect(404);
      await api('post', `/offers/${unknownId}/withdraw`, dan).expect(404);
      await api('post', '/offers/nope/withdraw', dan).expect(404);
      expect(await offerStatus(offer.id)).toBe('pending');
    });

    it('is 409 for an offer that is no longer pending', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/withdraw`, dan).expect(200);
      await api('post', `/offers/${offer.id}/withdraw`, dan).expect(409);
    });

    it('is 409 for an expired offer, and marks it expired', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      secondsLater(OFFER_TTL_MS / 1000);
      await api('post', `/offers/${offer.id}/withdraw`, dan).expect(409);
      expect(await offerStatus(offer.id)).toBe('expired');
    });
  });

  describe('GET /driver/offers/active', () => {
    it('needs a driver profile', async () => {
      await makeCustomer(alice);
      await api('get', '/driver/offers/active', alice).expect(403);
    });

    it("lists the driver's offers of the last hour with their status, newest first", async () => {
      const req = await setUp({ withEve: true });
      await makeCustomer(bob);
      const other = await createRequest(bob, { ...tunis, address: 'Tunis 2' });

      const old = await makeOffer(dan, req.id);
      await api('post', `/offers/${old.id}/withdraw`, dan).expect(200);
      secondsLater(10);
      const mine = await makeOffer(dan, other.id);
      await makeOffer(eve, req.id);

      const res = await api('get', '/driver/offers/active', dan).expect(200);
      const list = z.array(offerSchema).parse(res.body);
      expect(list.map((o) => [o.id, o.status])).toEqual([
        [mine.id, 'pending'],
        [old.id, 'withdrawn'],
      ]);

      secondsLater(3600 - 5);
      const later = z
        .array(offerSchema)
        .parse((await api('get', '/driver/offers/active', dan).expect(200)).body);
      expect(later.map((o) => [o.id, o.status])).toEqual([[mine.id, 'expired']]);
    });

    it('shows an offer as expired once OFFER_TTL_MS has passed, not before', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      const status = async () =>
        z
          .array(offerSchema)
          .parse((await api('get', '/driver/offers/active', dan).expect(200)).body)[0]!.status;

      secondsLater(OFFER_TTL_MS / 1000 - 1);
      expect(await status()).toBe('pending');
      secondsLater(1);
      expect(await status()).toBe('expired');
      expect(await offerStatus(offer.id)).toBe('expired');
    });

    it('expires pending offers on a request that expired', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await database.db
        .update(towOffers)
        .set({ expiresAt: new Date(now.getTime() + 60 * 60_000) })
        .where(eq(towOffers.id, offer.id));

      secondsLater(15 * 60);
      await api('get', '/tow-requests/active', alice).expect(204);
      await api('get', '/driver/offers/active', dan).expect(200);
      expect(await offerStatus(offer.id)).toBe('expired');
    });
  });

  describe('GET /tow-requests/:id/offers', () => {
    it('rejects a request without a token', async () => {
      await api('get', `/tow-requests/${unknownId}/offers`).expect(401);
    });

    it("is 404 for another customer's request or an unknown id", async () => {
      const req = await setUp();
      await makeCustomer(bob);
      await api('get', `/tow-requests/${req.id}/offers`, bob).expect(404);
      await api('get', `/tow-requests/${unknownId}/offers`, alice).expect(404);
      await api('get', '/tow-requests/nope/offers', alice).expect(404);
    });

    it('lists pending, unexpired offers with the driver, lowest fare first', async () => {
      const req = await setUp({ withEve: true });
      const fromDan = await makeOffer(dan, req.id, suggested + 10);
      secondsLater(30);
      const fromEve = await makeOffer(eve, req.id, suggested);

      const res = await api('get', `/tow-requests/${req.id}/offers`, alice).expect(200);
      const list = z.array(customerOfferSchema).parse(res.body);
      expect(list).toEqual([
        { ...fromEve, driver: { fullName: 'Eve Driver', truckType: 'wheel_lift', rating: NEW } },
        { ...fromDan, driver: { fullName: 'Dan Driver', truckType: 'flatbed', rating: NEW } },
      ]);
      expect(res.body[0].driver).not.toHaveProperty('phone');

      secondsLater(OFFER_TTL_MS / 1000 - 30);
      const later = await api('get', `/tow-requests/${req.id}/offers`, alice).expect(200);
      expect(later.body.map((o: { id: string }) => o.id)).toEqual([fromEve.id]);
    });
  });

  describe('POST /offers/:id/decline', () => {
    it('declines a pending offer', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);

      const res = await api('post', `/offers/${offer.id}/decline`, alice).expect(200);

      expect(customerOfferSchema.parse(res.body)).toMatchObject({
        id: offer.id,
        status: 'declined',
      });
      expect(await offerStatus(offer.id)).toBe('declined');
      // The driver may offer again.
      await makeOffer(dan, req.id);
    });

    it("is 404 for an offer on someone else's request", async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await makeCustomer(bob);
      await api('post', `/offers/${offer.id}/decline`, bob).expect(404);
      await api('post', `/offers/${offer.id}/decline`, dan).expect(404);
      await api('post', `/offers/${unknownId}/decline`, alice).expect(404);
      expect(await offerStatus(offer.id)).toBe('pending');
    });

    it('is 409 for an offer that is no longer pending', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/withdraw`, dan).expect(200);
      await api('post', `/offers/${offer.id}/decline`, alice).expect(409);
    });
  });

  describe('POST /offers/:id/accept', () => {
    it('assigns the request, accepts the offer and rejects the others', async () => {
      const req = await setUp({ withEve: true });
      const fromDan = await makeOffer(dan, req.id, suggested + 5);
      const fromEve = await makeOffer(eve, req.id);
      await makeCustomer(bob);
      const bobs = await createRequest(bob, { ...tunis, address: 'Tunis 2' });
      const danOnBob = await makeOffer(dan, bobs.id);
      secondsLater(20);

      const res = await api('post', `/offers/${fromDan.id}/accept`, alice).expect(200);

      const assigned = towRequestSchema.parse(res.body);
      expect(assigned).toMatchObject({
        id: req.id,
        status: 'assigned',
        agreedFare: suggested + 5,
        assignedAt: now.toISOString(),
        driver: {
          fullName: 'Dan Driver',
          phone: '+21698222222',
          truckType: 'flatbed',
          plateNumber: '123 TUN 4567',
        },
      });
      expect((await requestRow(req.id)).assignedDriverId).toBe(await accountId(dan));
      expect(await offerStatus(fromDan.id)).toBe('accepted');
      expect(await offerStatus(fromEve.id)).toBe('rejected');
      // Dan has a job now, so his other offers are withdrawn.
      expect(await offerStatus(danOnBob.id)).toBe('withdrawn');

      const active = await api('get', '/tow-requests/active', alice).expect(200);
      expect(towRequestSchema.parse(active.body)).toEqual(assigned);
    });

    it("is 404 for an offer on someone else's request", async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await makeCustomer(bob);
      await api('post', `/offers/${offer.id}/accept`, bob).expect(404);
      await api('post', `/offers/${offer.id}/accept`, dan).expect(404);
      await api('post', `/offers/${unknownId}/accept`, alice).expect(404);
      await api('post', '/offers/nope/accept', alice).expect(404);
      expect(await offerStatus(offer.id)).toBe('pending');
    });

    it('is 409 for an expired offer, not before', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      secondsLater(OFFER_TTL_MS / 1000);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(409);
      expect((await requestRow(req.id)).status).toBe('open');

      await goOnline(dan);
      const fresh = await makeOffer(dan, req.id);
      secondsLater(OFFER_TTL_MS / 1000 - 1);
      await api('post', `/offers/${fresh.id}/accept`, alice).expect(200);
    });

    it('is 409 for a withdrawn or declined offer', async () => {
      const req = await setUp({ withEve: true });
      const fromDan = await makeOffer(dan, req.id);
      const fromEve = await makeOffer(eve, req.id);
      await api('post', `/offers/${fromDan.id}/withdraw`, dan).expect(200);
      await api('post', `/offers/${fromEve.id}/decline`, alice).expect(200);

      await api('post', `/offers/${fromDan.id}/accept`, alice).expect(409);
      await api('post', `/offers/${fromEve.id}/accept`, alice).expect(409);
    });

    it('is 409 once the request is assigned', async () => {
      const req = await setUp({ withEve: true });
      const fromDan = await makeOffer(dan, req.id);
      const fromEve = await makeOffer(eve, req.id);
      await api('post', `/offers/${fromDan.id}/accept`, alice).expect(200);
      await api('post', `/offers/${fromEve.id}/accept`, alice).expect(409);
      await api('post', `/offers/${fromDan.id}/accept`, alice).expect(409);
    });

    it('is 409 when the driver took another job meanwhile', async () => {
      const req = await setUp();
      await makeCustomer(bob);
      const bobs = await createRequest(bob, { ...tunis, address: 'Tunis 2' });
      const forAlice = await makeOffer(dan, req.id);
      const forBob = await makeOffer(dan, bobs.id);
      // Simulate the other offer still being pending, as if it was read before the first accept.
      await api('post', `/offers/${forBob.id}/accept`, bob).expect(200);
      await database.db
        .update(towOffers)
        .set({ status: 'pending' })
        .where(eq(towOffers.id, forAlice.id));

      await api('post', `/offers/${forAlice.id}/accept`, alice).expect(409);
      expect((await requestRow(req.id)).status).toBe('open');
    });

    it('lets only one of two parallel accepts on the same request win', async () => {
      for (let round = 0; round < 3; round += 1) {
        await database.db.delete(users);
        const req = await setUp({ withEve: true });
        const fromDan = await makeOffer(dan, req.id);
        const fromEve = await makeOffer(eve, req.id);

        const results = await Promise.all([
          api('post', `/offers/${fromDan.id}/accept`, alice),
          api('post', `/offers/${fromEve.id}/accept`, alice),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        const winner = results[0]!.status === 200 ? fromDan : fromEve;
        const loser = winner === fromDan ? fromEve : fromDan;
        const row = await requestRow(req.id);
        expect(row.status).toBe('assigned');
        expect(row.agreedFareTnd).toBe(winner.fare);
        expect(await offerStatus(winner.id)).toBe('accepted');
        expect(await offerStatus(loser.id)).toBe('rejected');
      }
    });

    it("lets only one of a driver's two offers be accepted when both are accepted at once", async () => {
      for (let round = 0; round < 3; round += 1) {
        await database.db.delete(users);
        const req = await setUp();
        await makeCustomer(bob, 'Bob Customer');
        const bobs = await createRequest(bob, { ...tunis, address: 'Tunis 2' });
        const forAlice = await makeOffer(dan, req.id);
        const forBob = await makeOffer(dan, bobs.id);

        const results = await Promise.all([
          api('post', `/offers/${forAlice.id}/accept`, alice),
          api('post', `/offers/${forBob.id}/accept`, bob),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        const statuses = [(await requestRow(req.id)).status, (await requestRow(bobs.id)).status];
        expect(statuses.sort()).toEqual(['assigned', 'open']);
        const jobs = await database.db
          .select()
          .from(towRequests)
          .where(eq(towRequests.assignedDriverId, await accountId(dan)));
        expect(jobs).toHaveLength(1);
      }
    });
  });

  describe('GET /driver/job', () => {
    it('needs a driver profile', async () => {
      await makeCustomer(alice);
      await api('get', '/driver/job', alice).expect(403);
    });

    it('is 204 without a job', async () => {
      const req = await setUp();
      await makeOffer(dan, req.id);
      await api('get', '/driver/job', dan).expect(204);
    });

    it("returns the job with the customer's contact and the agreed fare", async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id, suggested + 3);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);

      const res = await api('get', '/driver/job', dan).expect(200);

      expect(driverJobSchema.parse(res.body)).toMatchObject({
        id: req.id,
        status: 'assigned',
        pickup: req.pickup,
        dropoff: req.dropoff,
        vehicleType: 'car',
        problemType: 'breakdown',
        agreedFare: suggested + 3,
        assignedAt: now.toISOString(),
        customer: { fullName: 'Alice Customer', phone: '+21698111111' },
      });
    });

    it('never expires an assigned request', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);
      secondsLater(60 * 60);
      await api('get', '/driver/job', dan).expect(200);
      expect((await api('get', '/tow-requests/active', alice).expect(200)).body.status).toBe(
        'assigned',
      );
    });
  });

  describe('DELETE /me during a job', () => {
    it("cancels the driver's assigned request and frees the customer", async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);
      secondsLater(30);

      await api('delete', '/me', dan).expect(204);

      const row = await requestRow(req.id);
      expect(row).toMatchObject({ status: 'cancelled', assignedDriverId: null });
      expect(row.cancelledAt).toBeInstanceOf(Date);
      await api('get', '/tow-requests/active', alice).expect(204);
    });

    it("leaves the driver's other customers' open requests alone", async () => {
      const req = await setUp();
      await makeCustomer(bob);
      const bobs = await createRequest(bob, { ...tunis, address: 'Tunis 2' });
      const offer = await makeOffer(dan, req.id);
      await makeOffer(dan, bobs.id);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);

      await api('delete', '/me', dan).expect(204);

      expect((await requestRow(bobs.id)).status).toBe('open');
      await api('get', `/tow-requests/${bobs.id}/offers`, bob).expect(200, []);
    });

    it('removes the customer request, so the driver has no job', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);
      await api('get', '/driver/job', dan).expect(200);

      await api('delete', '/me', alice).expect(204);

      await api('get', '/driver/job', dan).expect(204);
    });
  });

  describe('concurrent accepts', () => {
    it(
      'both succeed when two drivers cross-accept on two requests',
      { timeout: 30_000 },
      async () => {
        await makeCustomer(alice);
        await makeCustomer(bob);
        await makeDriver(dan);
        await goOnline(dan);
        await makeDriver(eve, 'Eve Driver', 'wheel_lift');
        await goOnline(eve, ariana);
        const danId = await accountId(dan);
        const eveId = await accountId(eve);

        for (let round = 0; round < 5; round += 1) {
          await database.db.delete(towRequests);
          const r1 = await createRequest(alice);
          const r2 = await createRequest(bob, { ...tunis, address: 'Tunis 2' });
          const danOnR1 = await makeOffer(dan, r1.id);
          const danOnR2 = await makeOffer(dan, r2.id);
          const eveOnR1 = await makeOffer(eve, r1.id);
          const eveOnR2 = await makeOffer(eve, r2.id);

          const [first, second] = await Promise.all([
            api('post', `/offers/${danOnR1.id}/accept`, alice),
            api('post', `/offers/${eveOnR2.id}/accept`, bob),
          ]);

          expect([first.status, second.status]).toEqual([200, 200]);
          expect((await requestRow(r1.id)).assignedDriverId).toBe(danId);
          expect((await requestRow(r2.id)).assignedDriverId).toBe(eveId);
          expect(await offerStatus(danOnR1.id)).toBe('accepted');
          expect(await offerStatus(eveOnR2.id)).toBe('accepted');
          expect(await offerStatus(danOnR2.id)).toMatch(/rejected|withdrawn/);
          expect(await offerStatus(eveOnR1.id)).toMatch(/rejected|withdrawn/);
          await api('get', '/driver/job', dan).expect(200);
          await api('get', '/driver/job', eve).expect(200);
        }
      },
    );
  });

  describe('changes to existing endpoints', () => {
    const assign = async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);
      return req;
    };

    it('lets the customer cancel an assigned request', async () => {
      const req = await assign();

      const res = await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);

      expect(towRequestSchema.parse(res.body)).toMatchObject({ status: 'cancelled' });
      await api('get', '/tow-requests/active', alice).expect(204);
      await api('get', '/driver/job', dan).expect(204);
    });

    it('lets the assigned driver cancel the job', async () => {
      const req = await assign();

      const res = await api('post', `/tow-requests/${req.id}/cancel`, dan)
        .send({ reason: 'unsafe' })
        .expect(200);

      expect(towRequestSchema.parse(res.body)).toMatchObject({ id: req.id, status: 'cancelled' });
      expect((await requestRow(req.id)).cancelledAt).toEqual(now);
      await api('get', '/driver/job', dan).expect(204);
      await api('get', '/tow-requests/active', alice).expect(204);
      // Back to work: Dan sees requests again.
      await makeCustomer(bob);
      const other = await createRequest(bob);
      await makeOffer(dan, other.id);
    });

    it('does not let another driver cancel, nor a driver cancel an open request', async () => {
      const req = await setUp({ withEve: true });
      await makeOffer(dan, req.id);
      await api('post', `/tow-requests/${req.id}/cancel`, dan).expect(404);

      const offer = await makeOffer(eve, req.id);
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);
      await api('post', `/tow-requests/${req.id}/cancel`, dan).expect(404);
      expect((await requestRow(req.id)).status).toBe('assigned');
    });

    it('rejects pending offers when the customer cancels', async () => {
      const req = await setUp();
      const offer = await makeOffer(dan, req.id);
      await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);
      expect(await offerStatus(offer.id)).toBe('rejected');
    });

    it('does not let a customer open a new request while one is assigned', async () => {
      await assign();
      await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(409);
    });

    it('shows the agreed fare, but no driver, in the history of a cancelled job', async () => {
      const req = await assign();
      await api('post', `/tow-requests/${req.id}/cancel`, dan)
        .send({ reason: 'unsafe' })
        .expect(200);
      const res = await api('get', '/tow-requests', alice).expect(200);
      expect(res.body.items[0]).toMatchObject({ status: 'cancelled', agreedFare: suggested });
      expect(res.body.items[0].driver ?? null).toBeNull();
    });
  });
});
