import {
  driverPresenceSchema,
  fareBounds,
  haversineM,
  NEARBY_RADIUS_M,
  nearbyRequestSchema,
  PRESENCE_STALE_MS,
  ROAD_FACTOR,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { z } from 'zod';

import { driverPresence, towOffers, towRequests, users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815 };
const laMarsa = { latitude: 36.878, longitude: 10.325 }; // ~15 km from Tunis
const hammamet = { latitude: 36.4, longitude: 10.61 }; // ~60 km
const sfax = { latitude: 34.74, longitude: 10.76 };

/** A point due north of Tunis, `metres` away on a sphere (within ~0.3% of PostGIS). */
const northOfTunis = (metres: number) => ({
  latitude: tunis.latitude + metres / 111_195,
  longitude: tunis.longitude,
});

describe('driver presence and nearby requests (e2e)', () => {
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

  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';

  const api = (method: 'get' | 'put', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const makeDriver = (token: string) =>
    api('put', '/me/driver-profile', token)
      .send({
        fullName: 'Driver',
        phone: '+21698123456',
        truckType: 'flatbed',
        plateNumber: '123 TUN 4567',
      })
      .expect(200);
  const putPresence = (token: string | undefined, body: object) =>
    api('put', '/driver/presence', token).send(body);
  const goOnline = (token: string, location = tunis) =>
    putPresence(token, { online: true, location }).expect(200);
  const nearby = async (token: string) => {
    const res = await api('get', '/driver/requests/nearby', token).expect(200);
    return z.array(nearbyRequestSchema).parse(res.body);
  };
  const accountId = async (token: string) => {
    const uid = token.split(':')[0]!.replace('token-', '');
    const [row] = await database.db.select().from(users).where(eq(users.firebaseUid, uid));
    return row!.id;
  };

  let seeded = 0;
  /** Inserts a customer with a request picking up at `pickup`. */
  const seedRequest = async (
    pickup: { latitude: number; longitude: number },
    overrides: Partial<typeof towRequests.$inferInsert> = {},
  ) => {
    seeded += 1;
    const [customer] = await database.db
      .insert(users)
      .values({ firebaseUid: `seed-${seeded}-${Date.now()}` })
      .returning();
    const [row] = await database.db
      .insert(towRequests)
      .values({
        customerId: customer!.id,
        pickup:
          sql`ST_SetSRID(ST_MakePoint(${pickup.longitude}::float8, ${pickup.latitude}::float8), 4326)::geography` as never,
        pickupAddress: `Pickup ${seeded}`,
        dropoff:
          sql`ST_SetSRID(ST_MakePoint(${sfax.longitude}::float8, ${sfax.latitude}::float8), 4326)::geography` as never,
        dropoffAddress: 'Sfax',
        vehicleType: 'car',
        problemType: 'breakdown',
        distanceM: 40_000,
        suggestedFareTnd: 100,
        proposedFareTnd: 90,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .returning();
    return { customerId: customer!.id, id: row!.id };
  };

  describe('PUT /driver/presence', () => {
    it('rejects a request without a token', async () => {
      await putPresence(undefined, { online: false }).expect(401);
    });

    it('needs a driver profile', async () => {
      await putPresence(dan, { online: true, location: tunis }).expect(403);
      expect(await database.db.select().from(driverPresence)).toHaveLength(0);
    });

    it('goes online with a location and stamps the time from the clock', async () => {
      await makeDriver(dan);
      const res = await goOnline(dan);
      expect(driverPresenceSchema.parse(res.body)).toEqual({
        online: true,
        location: tunis,
        locationUpdatedAt: now.toISOString(),
      });
    });

    it('upserts: a second call replaces the location', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      secondsLater(15);
      const res = await goOnline(dan, laMarsa);
      expect(driverPresenceSchema.parse(res.body)).toMatchObject({
        location: laMarsa,
        locationUpdatedAt: now.toISOString(),
      });
      expect(await database.db.select().from(driverPresence)).toHaveLength(1);
    });

    it('going offline keeps the last location and its time', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      const sentAt = now.toISOString();
      secondsLater(30);
      const res = await putPresence(dan, { online: false }).expect(200);
      expect(driverPresenceSchema.parse(res.body)).toEqual({
        online: false,
        location: tunis,
        locationUpdatedAt: sentAt,
      });
    });

    it('going online without a location shows nothing nearby', async () => {
      await makeDriver(dan);
      await seedRequest(tunis);
      const res = await putPresence(dan, { online: true }).expect(200);
      expect(driverPresenceSchema.parse(res.body).online).toBe(true);
      expect(await nearby(dan)).toEqual([]);
    });

    it.each([
      [
        'a location outside Tunisia',
        { online: true, location: { latitude: 48.85, longitude: 2.35 } },
      ],
      ['a missing flag', { location: tunis }],
    ])('rejects %s with 400', async (_, body) => {
      await makeDriver(dan);
      await putPresence(dan, body).expect(400);
    });
  });

  describe('GET /driver/requests/nearby', () => {
    it('rejects a request without a token', async () => {
      await api('get', '/driver/requests/nearby').expect(401);
    });

    it('needs a driver profile', async () => {
      await api('get', '/driver/requests/nearby', dan).expect(403);
    });

    it('is empty for a driver who never set presence', async () => {
      await makeDriver(dan);
      await seedRequest(tunis);
      expect(await nearby(dan)).toEqual([]);
    });

    it('shows a request in range with distance, fare bounds and no customer contact', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      const { id } = await seedRequest(laMarsa);

      const res = await api('get', '/driver/requests/nearby', dan).expect(200);
      const [item] = z.array(nearbyRequestSchema).parse(res.body);
      const { min, max } = fareBounds(100);
      expect(item).toMatchObject({
        id,
        proposedFare: 90,
        suggestedFare: 100,
        minFare: min,
        maxFare: max,
        distanceM: 40_000,
        pickup: { ...laMarsa, address: expect.any(String) },
      });
      const expected = haversineM(tunis, laMarsa) * ROAD_FACTOR;
      expect(Math.abs(item!.distanceToPickupM - expected)).toBeLessThan(expected * 0.01);
      expect(item!.myOffer ?? null).toBeNull();
      expect(res.body[0]).not.toHaveProperty('customer');
      expect(res.body[0]).not.toHaveProperty('customerId');
    });

    it('decides the radius edge by straight-line distance', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      const inside = await seedRequest(northOfTunis(NEARBY_RADIUS_M - 500));
      await seedRequest(northOfTunis(NEARBY_RADIUS_M + 500));
      await seedRequest(hammamet);
      await seedRequest(sfax);

      expect((await nearby(dan)).map((r) => r.id)).toEqual([inside.id]);
    });

    it('is empty when the driver is offline', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      await seedRequest(laMarsa);
      await putPresence(dan, { online: false }).expect(200);
      expect(await nearby(dan)).toEqual([]);
    });

    it('is empty once the location is older than PRESENCE_STALE_MS, not before', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      await seedRequest(laMarsa);

      secondsLater(PRESENCE_STALE_MS / 1000);
      expect(await nearby(dan)).toHaveLength(1);
      secondsLater(1);
      expect(await nearby(dan)).toEqual([]);

      await goOnline(dan);
      expect(await nearby(dan)).toHaveLength(1);
    });

    it('is empty while the driver has an assigned job', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      await seedRequest(laMarsa);
      await seedRequest(tunis, {
        status: 'assigned',
        assignedDriverId: await accountId(dan),
        agreedFareTnd: 90,
        assignedAt: now,
      });
      expect(await nearby(dan)).toEqual([]);
    });

    it("still shows requests when another driver has a job or the driver's own job ended", async () => {
      await makeDriver(dan);
      await makeDriver(eve);
      await goOnline(dan);
      await seedRequest(laMarsa);
      await seedRequest(tunis, {
        status: 'assigned',
        assignedDriverId: await accountId(eve),
        agreedFareTnd: 90,
        assignedAt: now,
      });
      await seedRequest(tunis, {
        status: 'cancelled',
        assignedDriverId: await accountId(dan),
        cancelledAt: now,
      });
      expect(await nearby(dan)).toHaveLength(1);
    });

    it("excludes the driver's own request", async () => {
      await makeDriver(dan);
      await goOnline(dan);
      const mine = await seedRequest(tunis);
      await database.db
        .update(towRequests)
        .set({ customerId: await accountId(dan) })
        .where(eq(towRequests.id, mine.id));
      const other = await seedRequest(laMarsa);
      expect((await nearby(dan)).map((r) => r.id)).toEqual([other.id]);
    });

    it('excludes cancelled and assigned requests', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      await seedRequest(tunis, { status: 'cancelled', cancelledAt: now });
      await seedRequest(tunis, { status: 'assigned', assignedAt: now, agreedFareTnd: 90 });
      const open = await seedRequest(laMarsa);
      expect((await nearby(dan)).map((r) => r.id)).toEqual([open.id]);
    });

    it('excludes expired requests and marks them expired', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      const stale = await seedRequest(tunis, { expiresAt: new Date(now.getTime() - 1000) });
      const open = await seedRequest(laMarsa);

      expect((await nearby(dan)).map((r) => r.id)).toEqual([open.id]);
      const [row] = await database.db
        .select({ status: towRequests.status })
        .from(towRequests)
        .where(eq(towRequests.id, stale.id));
      expect(row!.status).toBe('expired');
    });

    it('orders by distance, nearest first', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      const far = await seedRequest(northOfTunis(20_000));
      const near = await seedRequest(northOfTunis(2_000));
      const mid = await seedRequest(northOfTunis(10_000));
      const list = await nearby(dan);
      expect(list.map((r) => r.id)).toEqual([near.id, mid.id, far.id]);
      expect(list[0]!.distanceToPickupM).toBeLessThan(list[1]!.distanceToPickupM);
    });

    it('returns at most 30 requests, dropping the farthest', async () => {
      await makeDriver(dan);
      await goOnline(dan);
      for (let i = 0; i < 31; i += 1) await seedRequest(northOfTunis(1_000 + i * 100));
      const list = await nearby(dan);
      expect(list).toHaveLength(30);
      expect(list.at(-1)!.pickup.latitude).toBeLessThan(northOfTunis(1_000 + 30 * 100).latitude);
    });

    it("includes the driver's pending offer as myOffer, and ignores other states and drivers", async () => {
      await makeDriver(dan);
      await makeDriver(eve);
      await goOnline(dan);
      const { id } = await seedRequest(laMarsa);
      const insertOffer = (driverId: string, status: 'pending' | 'withdrawn', fare: number) =>
        database.db
          .insert(towOffers)
          .values({
            requestId: id,
            driverId,
            fareTnd: fare,
            distanceToPickupM: 19_000,
            etaMin: 29,
            status,
            expiresAt: new Date(now.getTime() + 180_000),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

      expect((await nearby(dan))[0]!.myOffer ?? null).toBeNull();

      await insertOffer(await accountId(eve), 'pending', 95);
      await insertOffer(await accountId(dan), 'withdrawn', 85);
      expect((await nearby(dan))[0]!.myOffer ?? null).toBeNull();

      const [mine] = await insertOffer(await accountId(dan), 'pending', 92);
      const [item] = await nearby(dan);
      expect(item!.myOffer).toEqual({
        id: mine!.id,
        requestId: id,
        fare: 92,
        etaMin: 29,
        distanceToPickupM: 19_000,
        status: 'pending',
        expiresAt: new Date(now.getTime() + 180_000).toISOString(),
        createdAt: now.toISOString(),
      });
    });
  });
});
