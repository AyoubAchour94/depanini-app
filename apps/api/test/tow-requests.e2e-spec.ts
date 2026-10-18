import {
  estimateRoadDistanceM,
  fareBounds,
  fareEstimateSchema,
  suggestFare,
  towRequestPageSchema,
  towRequestSchema,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';

import { towRequests, users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };

describe('tow requests (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');
  const minutesLater = (minutes: number) => {
    now = new Date(now.getTime() + minutes * 60_000);
  };

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now });
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    // Requests and profiles go with their account (cascade).
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const bob = 'token-bob:bob@example.com';

  const api = (method: 'get' | 'post' | 'put', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const makeCustomer = (token: string) =>
    api('put', '/me/customer-profile', token)
      .send({ fullName: 'Customer', phone: '+21698123456' })
      .expect(200);

  const distanceM = estimateRoadDistanceM(tunis, sousse);
  const suggested = suggestFare(distanceM, 'car');
  const body = (overrides: object = {}) => ({
    pickup: tunis,
    dropoff: sousse,
    vehicleType: 'car',
    problemType: 'breakdown',
    proposedFare: suggested,
    ...overrides,
  });
  const create = (token: string, overrides: object = {}) =>
    api('post', '/tow-requests', token).send(body(overrides));

  describe('POST /tow-requests/estimate', () => {
    const estimate = (token?: string, input: object = {}) =>
      api('post', '/tow-requests/estimate', token).send({
        pickup: tunis,
        dropoff: sousse,
        vehicleType: 'car',
        ...input,
      });

    it('rejects a request without a token', async () => {
      await estimate().expect(401);
    });

    it('measures the distance in PostGIS and suggests a fare', async () => {
      const res = await estimate(alice).expect(200);
      const parsed = fareEstimateSchema.parse(res.body);

      // PostGIS measures on the spheroid, the shared helper on a sphere.
      expect(Math.abs(parsed.distanceM - distanceM) / distanceM).toBeLessThan(0.01);
      expect(parsed.suggestedFare).toBe(suggestFare(parsed.distanceM, 'car'));
      const { min, max } = fareBounds(parsed.suggestedFare);
      expect(parsed).toMatchObject({ minFare: min, maxFare: max });
    });

    it('prices by vehicle type', async () => {
      const car = fareEstimateSchema.parse((await estimate(alice).expect(200)).body);
      const suv = fareEstimateSchema.parse(
        (await estimate(alice, { vehicleType: 'suv_van' }).expect(200)).body,
      );
      expect(suv.suggestedFare).toBeGreaterThan(car.suggestedFare);
    });

    it('needs no customer profile', async () => {
      await estimate(alice).expect(200);
    });

    it.each([
      ['a place outside Tunisia', { pickup: { ...tunis, latitude: 48.85, longitude: 2.35 } }],
      ['an unknown vehicle type', { vehicleType: 'boat' }],
    ])('rejects %s with 400', async (_, input) => {
      await estimate(alice, input).expect(400);
    });
  });

  describe('POST /tow-requests', () => {
    it('rejects a request without a token', async () => {
      await api('post', '/tow-requests').send(body()).expect(401);
    });

    it('needs a customer profile', async () => {
      await create(alice).expect(403);
      expect(await database.db.select().from(towRequests)).toHaveLength(0);
    });

    it('creates an open request that expires in 15 minutes', async () => {
      await makeCustomer(alice);

      const res = await create(alice, { note: '  engine smoke ' }).expect(201);
      const created = towRequestSchema.parse(res.body);

      expect(created).toMatchObject({
        status: 'open',
        pickup: tunis,
        dropoff: sousse,
        vehicleType: 'car',
        problemType: 'breakdown',
        note: 'engine smoke',
        proposedFare: suggested,
        createdAt: '2026-06-01T10:00:00.000Z',
        expiresAt: '2026-06-01T10:15:00.000Z',
      });
      expect(created.suggestedFare).toBe(suggestFare(created.distanceM, 'car'));
      expect(Math.abs(created.distanceM - distanceM) / distanceM).toBeLessThan(0.01);
    });

    it('returns a null note when none is given', async () => {
      await makeCustomer(alice);

      const res = await create(alice).expect(201);

      expect(res.body.note).toBeNull();
    });

    it('recomputes the fare on the server', async () => {
      await makeCustomer(alice);

      // A client-supplied suggestion or distance is ignored.
      const res = await create(alice, { suggestedFare: 1, distanceM: 1 }).expect(201);

      expect(res.body.suggestedFare).toBeGreaterThan(1);
      expect(res.body.distanceM).toBeGreaterThan(1000);
    });

    it('accepts the bounds and rejects a fare outside them', async () => {
      await makeCustomer(alice);
      const { minFare, maxFare } = fareEstimateSchema.parse(
        (
          await api('post', '/tow-requests/estimate', alice)
            .send({ pickup: tunis, dropoff: sousse, vehicleType: 'car' })
            .expect(200)
        ).body,
      );

      for (const proposedFare of [minFare - 1, maxFare + 1]) {
        const res = await create(alice, { proposedFare }).expect(400);
        expect(res.body.issues).toEqual([expect.objectContaining({ path: ['proposedFare'] })]);
      }
      expect(await database.db.select().from(towRequests)).toHaveLength(0);

      await create(alice, { proposedFare: minFare }).expect(201);
    });

    it('accepts the highest allowed fare', async () => {
      await makeCustomer(alice);
      const { maxFare } = fareEstimateSchema.parse(
        (
          await api('post', '/tow-requests/estimate', alice)
            .send({ pickup: tunis, dropoff: sousse, vehicleType: 'car' })
            .expect(200)
        ).body,
      );

      await create(alice, { proposedFare: maxFare }).expect(201);
    });

    it.each([
      ['a non-integer fare', { proposedFare: 100.5 }],
      ['a place outside Tunisia', { dropoff: { ...sousse, latitude: 48.85, longitude: 2.35 } }],
      ['an unknown problem type', { problemType: 'ghost' }],
      ['a too long note', { note: 'x'.repeat(281) }],
    ])('rejects %s with 400', async (_, overrides) => {
      await makeCustomer(alice);

      await create(alice, overrides).expect(400);
    });

    it('allows only one open request per customer', async () => {
      await makeCustomer(alice);
      await create(alice).expect(201);

      await create(alice).expect(409);
      expect(await database.db.select().from(towRequests)).toHaveLength(1);
    });

    it('lets two customers each have one', async () => {
      await makeCustomer(alice);
      await makeCustomer(bob);

      await create(alice).expect(201);
      await create(bob).expect(201);
    });

    it('allows a new request once the previous one expired', async () => {
      await makeCustomer(alice);
      const first = await create(alice).expect(201);

      minutesLater(15);
      const second = await create(alice).expect(201);

      expect(second.body.id).not.toBe(first.body.id);
      const [row] = await database.db
        .select()
        .from(towRequests)
        .where(eq(towRequests.id, first.body.id));
      expect(row!.status).toBe('expired');
    });
  });

  describe('GET /tow-requests/active', () => {
    it('rejects a request without a token', async () => {
      await api('get', '/tow-requests/active').expect(401);
    });

    it('is 204 when there is no request', async () => {
      await api('get', '/tow-requests/active', alice).expect(204);
    });

    it('returns the open request', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);

      const res = await api('get', '/tow-requests/active', alice).expect(200);

      expect(towRequestSchema.parse(res.body)).toEqual(created.body);
    });

    it('is 204 once the request expired, and marks it expired', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);

      minutesLater(14);
      await api('get', '/tow-requests/active', alice).expect(200);
      minutesLater(1);
      await api('get', '/tow-requests/active', alice).expect(204);

      const history = towRequestPageSchema.parse(
        (await api('get', '/tow-requests', alice).expect(200)).body,
      );
      expect(history.items).toEqual([{ ...created.body, status: 'expired' }]);
    });

    it('does not show another customer’s request', async () => {
      await makeCustomer(alice);
      await create(alice).expect(201);

      await api('get', '/tow-requests/active', bob).expect(204);
    });
  });

  describe('GET /tow-requests', () => {
    it('rejects a request without a token', async () => {
      await api('get', '/tow-requests').expect(401);
    });

    it('is empty for a new customer', async () => {
      const res = await api('get', '/tow-requests', alice).expect(200);

      expect(towRequestPageSchema.parse(res.body)).toEqual({ items: [], nextCursor: null });
    });

    it('lists the history newest first, in pages', async () => {
      await makeCustomer(alice);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const created = await create(alice).expect(201);
        ids.unshift(created.body.id);
        minutesLater(1);
        await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(200);
      }
      await makeCustomer(bob);
      await create(bob).expect(201);

      const first = towRequestPageSchema.parse(
        (await api('get', '/tow-requests?limit=2', alice).expect(200)).body,
      );
      expect(first.items.map((r) => r.id)).toEqual(ids.slice(0, 2));
      expect(first.nextCursor).toEqual(expect.any(String));

      const second = towRequestPageSchema.parse(
        (
          await api(
            'get',
            `/tow-requests?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
            alice,
          ).expect(200)
        ).body,
      );
      expect(second.items.map((r) => r.id)).toEqual(ids.slice(2));
      expect(second.nextCursor).toBeNull();
    });

    it('pages through requests created at the same instant', async () => {
      await makeCustomer(alice);
      const at = new Date('2026-06-01T09:00:00.000Z');
      const [customer] = await database.db.select().from(users);
      for (let i = 0; i < 3; i++) {
        await database.db.execute(
          // Raw insert: the API never creates several at once.
          sqlInsert(customer!.id, at),
        );
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const url: string = `/tow-requests?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const page = towRequestPageSchema.parse((await api('get', url, alice).expect(200)).body);
        seen.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
      } while (cursor);

      expect(new Set(seen).size).toBe(3);
    });

    it('pages through requests created microseconds apart', async () => {
      await makeCustomer(alice);
      const [customer] = await database.db.select().from(users);
      for (const us of [1, 2, 3, 4]) {
        await database.db.execute(sqlInsert(customer!.id, `2026-06-01T09:00:00.00000${us}Z`));
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const url: string = `/tow-requests?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const page = towRequestPageSchema.parse((await api('get', url, alice).expect(200)).body);
        seen.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
      } while (cursor);

      const { rows } = await database.db.execute<{ id: string }>(
        sql`select id from tow_requests order by created_at desc`,
      );
      expect(rows).toHaveLength(4);
      expect(seen).toEqual(rows.map((r) => r.id));
    });

    it.each(['0', '51', 'abc'])('rejects limit=%s with 400', async (limit) => {
      await api('get', `/tow-requests?limit=${limit}`, alice).expect(400);
    });

    it('rejects a malformed cursor with 400', async () => {
      await api('get', '/tow-requests?cursor=nonsense', alice).expect(400);
    });
  });

  describe('POST /tow-requests/:id/cancel', () => {
    it('rejects a request without a token', async () => {
      await api('post', '/tow-requests/00000000-0000-4000-8000-000000000000/cancel').expect(401);
    });

    it('cancels an open request', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);
      minutesLater(2);

      const res = await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(200);

      expect(towRequestSchema.parse(res.body)).toEqual({
        ...created.body,
        status: 'cancelled',
        cancelledBy: 'customer',
      });
      const [row] = await database.db.select().from(towRequests);
      expect(row!.cancelledAt).toEqual(now);
      expect(row!.cancelledBy).toBe('customer');
      await api('get', '/tow-requests/active', alice).expect(204);
    });

    it('drops a reason given for an open request', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);

      const res = await api('post', `/tow-requests/${created.body.id}/cancel`, alice)
        .send({ reason: 'problem_solved' })
        .expect(200);

      expect(res.body).toMatchObject({ cancelledBy: 'customer', cancelReason: null });
    });

    it('lets the customer request again after cancelling', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);
      await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(200);

      await create(alice).expect(201);
    });

    it('is 404 for someone else’s request', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);

      await api('post', `/tow-requests/${created.body.id}/cancel`, bob).expect(404);
      await api('get', '/tow-requests/active', alice).expect(200);
    });

    it('is 404 for an unknown or malformed id', async () => {
      await api('post', '/tow-requests/00000000-0000-4000-8000-000000000000/cancel', alice).expect(
        404,
      );
      await api('post', '/tow-requests/nope/cancel', alice).expect(404);
    });

    it('is 409 for a request that is not open', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);
      await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(200);

      await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(409);
    });

    it('is 409 for an expired request', async () => {
      await makeCustomer(alice);
      const created = await create(alice).expect(201);
      minutesLater(20);

      await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(409);
    });
  });

  it('deleting the account deletes its requests', async () => {
    await makeCustomer(alice);
    await create(alice).expect(201);

    await request(app.getHttpServer()).delete('/me').set('Authorization', `Bearer ${alice}`);

    expect(await database.db.select().from(towRequests)).toHaveLength(0);
  });
});

function sqlInsert(customerId: string, atTime: Date | string) {
  const at = typeof atTime === 'string' ? atTime : atTime.toISOString();
  return sql`insert into tow_requests
    (customer_id, status, pickup, pickup_address, dropoff, dropoff_address, vehicle_type,
     problem_type, distance_m, suggested_fare_tnd, proposed_fare_tnd, expires_at, created_at)
    values (${customerId}, 'cancelled', ST_MakePoint(10.18, 36.8)::geography, 'a',
     ST_MakePoint(10.6, 35.8)::geography, 'b', 'car', 'breakdown', 1000, 50, 50, ${at},
     ${at})`;
}
