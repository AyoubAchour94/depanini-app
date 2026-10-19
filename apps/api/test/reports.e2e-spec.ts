import {
  estimateRoadDistanceM,
  MAX_REPORT_NOTE_LENGTH,
  reportSchema,
  REPORT_WINDOW_DAYS,
  suggestFare,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { z } from 'zod';

import { reports, users } from '../src/db/schema.js';
import { approveDriverByToken } from './support/approve-driver.js';
import { adminToken, createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date('2026-06-01T10:00:00.000Z');

describe('reports (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = START;

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now });
  });

  beforeEach(async () => {
    now = START;
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const bob = 'token-bob:bob@example.com';
  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';
  const root = adminToken('root');

  const api = (method: 'get' | 'post' | 'put', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  const customerProfile = (token: string, name: string) =>
    api('put', '/me/customer-profile', token)
      .send({ fullName: name, phone: '+21698111111' })
      .expect(200);
  const driverProfile = async (token: string, name: string, plate: string) => {
    await api('put', '/me/driver-profile', token)
      .send({ fullName: name, phone: '+21698222222', truckType: 'flatbed', plateNumber: plate })
      .expect(200);
    await approveDriverByToken(database.db, token);
  };
  const setUp = async () => {
    await customerProfile(alice, 'Alice Customer');
    await customerProfile(bob, 'Bob Customer');
    await driverProfile(dan, 'Dan Driver', 'DAN 1');
    await driverProfile(eve, 'Eve Driver', 'EVE 1');
  };

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
  /** Opens a request and assigns it to `driver`; the job is `accepted`. */
  const assign = async (customer: string, driver: string) => {
    await api('put', '/driver/presence', driver)
      .send({ online: true, location: laMarsa })
      .expect(200);
    const id = await open(customer);
    const offer = await api('post', `/tow-requests/${id}/offers`, driver)
      .send({ fare: suggested })
      .expect(201);
    await api('post', `/offers/${offer.body.id}/accept`, customer).expect(200);
    return id;
  };
  const completed = async (customer: string, driver: string) => {
    const id = await assign(customer, driver);
    for (const stage of ['en_route', 'arrived', 'towing']) {
      await api('post', '/driver/job/stage', driver).send({ stage }).expect(200);
    }
    await api('post', '/driver/job/complete', driver).send({ cashReceived: true }).expect(200);
    return id;
  };

  const report = (id: string, token: string, body: unknown) =>
    api('post', `/tow-requests/${id}/reports`, token).send(body as object);
  const mine = (id: string, token: string) => api('get', `/tow-requests/${id}/reports`, token);
  const good = { category: 'overcharged', note: 'Asked for more than we agreed' };

  describe('POST /tow-requests/:id/reports', () => {
    it('lets the customer and the assigned driver of a completed trip each report it', async () => {
      await setUp();
      const id = await completed(alice, dan);
      const byCustomer = await report(id, alice, good).expect(201);
      expect(reportSchema.parse(byCustomer.body)).toMatchObject({
        requestId: id,
        category: 'overcharged',
        note: good.note,
        status: 'open',
        resolutionNote: null,
        resolvedAt: null,
      });
      await report(id, dan, { category: 'no_show', note: 'Customer left' }).expect(201);
      const rows = await database.db.select().from(reports);
      expect(rows.map((r) => r.reporterRole).sort()).toEqual(['customer', 'driver']);
    });

    it('needs a sign-in, and is 404 for strangers, other drivers and unknown ids', async () => {
      await setUp();
      const id = await completed(alice, dan);
      await api('post', `/tow-requests/${id}/reports`).send(good).expect(401);
      await report(id, bob, good).expect(404);
      await report(id, eve, good).expect(404);
      await report('4a4cbd7c-6cb8-4a6a-8f4d-3a8d7b0cf2f1', alice, good).expect(404);
      await report('not-a-uuid', alice, good).expect(404);
      await mine(id, bob).expect(404);
      await mine(id, eve).expect(404);
      expect(await database.db.select().from(reports)).toHaveLength(0);
    });

    it('validates the category and the note', async () => {
      await setUp();
      const id = await completed(alice, dan);
      await report(id, alice, {}).expect(400);
      await report(id, alice, { category: 'nope', note: 'x' }).expect(400);
      await report(id, alice, { category: 'safety' }).expect(400);
      await report(id, alice, { category: 'safety', note: '' }).expect(400);
      await report(id, alice, { category: 'safety', note: '   ' }).expect(400);
      await report(id, alice, {
        category: 'safety',
        note: 'x'.repeat(MAX_REPORT_NOTE_LENGTH + 1),
      }).expect(400);
      expect(await database.db.select().from(reports)).toHaveLength(0);
      const edge = 'x'.repeat(MAX_REPORT_NOTE_LENGTH);
      const res = await report(id, alice, { category: 'safety', note: edge }).expect(201);
      expect(res.body.note).toBe(edge);
    });

    it('accepts every category', async () => {
      await setUp();
      for (const category of [
        'safety',
        'vehicle_damage',
        'overcharged',
        'no_show',
        'behaviour',
        'other',
      ]) {
        const id = await completed(alice, dan);
        await report(id, alice, { category, note: 'Something' }).expect(201);
      }
    });

    it('allows one open report per person per trip', async () => {
      await setUp();
      const id = await completed(alice, dan);
      await report(id, alice, good).expect(201);
      await report(id, alice, { category: 'other', note: 'Again' }).expect(409);
      expect(await database.db.select().from(reports)).toHaveLength(1);
      // The other side is not blocked by it, and another trip is a fresh start.
      await report(id, dan, good).expect(201);
      const other = await completed(alice, dan);
      await report(other, alice, good).expect(201);
    });

    it('allows a new report once the earlier one is resolved', async () => {
      await setUp();
      const id = await completed(alice, dan);
      const first = await report(id, alice, good).expect(201);
      await api('post', `/admin/reports/${first.body.id}/resolve`, root)
        .send({ note: 'Refunded the difference' })
        .expect(200);
      now = new Date(START.getTime() + 1000);
      await report(id, alice, { category: 'other', note: 'Still not right' }).expect(201);
      const list = await mine(id, alice).expect(200);
      expect(list.body.map((r: { status: string }) => r.status)).toEqual(['open', 'resolved']);
    });

    it('is 409 while the trip is still active', async () => {
      await setUp();
      const openId = await open(alice);
      await report(openId, alice, good).expect(409);
      const assigned = await assign(bob, dan);
      await report(assigned, bob, good).expect(409);
      await report(assigned, dan, good).expect(409);
      await api('post', '/driver/job/stage', dan).send({ stage: 'en_route' }).expect(200);
      await report(assigned, bob, good).expect(409);
      expect(await database.db.select().from(reports)).toHaveLength(0);
    });

    it('accepts a cancelled trip: by the customer alone when nobody was assigned', async () => {
      await setUp();
      const id = await open(alice);
      await api('post', `/tow-requests/${id}/cancel`, alice).send({}).expect(200);
      await report(id, dan, good).expect(404);
      await report(id, alice, good).expect(201);
    });

    it('accepts a trip cancelled after assignment, from both sides', async () => {
      await setUp();
      const id = await assign(alice, dan);
      await api('post', `/tow-requests/${id}/cancel`, dan)
        .send({ reason: 'truck_problem' })
        .expect(200);
      await report(id, alice, { category: 'no_show', note: 'The driver cancelled' }).expect(201);
      await report(id, dan, { category: 'other', note: 'Truck broke down' }).expect(201);
      await report(id, eve, good).expect(404);
    });

    it('honours the window from completion, inclusive, using the clock', async () => {
      await setUp();
      const id = await completed(alice, dan);
      now = new Date(START.getTime() + REPORT_WINDOW_DAYS * DAY_MS);
      await report(id, alice, good).expect(201);
      now = new Date(START.getTime() + REPORT_WINDOW_DAYS * DAY_MS + 1);
      await report(id, dan, good).expect(409);
      await mine(id, alice).expect(200);
    });

    it('honours the window from cancellation', async () => {
      await setUp();
      const id = await open(alice);
      await api('post', `/tow-requests/${id}/cancel`, alice).send({}).expect(200);
      now = new Date(START.getTime() + REPORT_WINDOW_DAYS * DAY_MS + 1);
      await report(id, alice, good).expect(409);
    });
  });

  describe('GET /tow-requests/:id/reports', () => {
    it('is empty before any report, and shows only the caller own reports', async () => {
      await setUp();
      const id = await completed(alice, dan);
      expect((await mine(id, alice).expect(200)).body).toEqual([]);
      await api('get', `/tow-requests/${id}/reports`).expect(401);
      await report(id, alice, good).expect(201);
      await report(id, dan, { category: 'behaviour', note: 'Rude' }).expect(201);
      const customer = (await mine(id, alice).expect(200)).body;
      expect(customer).toHaveLength(1);
      expect(customer[0].note).toBe(good.note);
      const driver = (await mine(id, dan).expect(200)).body;
      expect(driver).toHaveLength(1);
      expect(driver[0].note).toBe('Rude');
      // Not even the requester's id is leaked.
      expect(z.array(reportSchema).parse(customer)[0]).not.toHaveProperty('reporterUserId');
    });

    it('is still readable after the window, and shows the admin resolution', async () => {
      await setUp();
      const id = await completed(alice, dan);
      const created = await report(id, alice, good).expect(201);
      now = new Date(START.getTime() + 30 * DAY_MS);
      expect((await mine(id, alice).expect(200)).body[0]).toMatchObject({ status: 'open' });

      await api('post', `/admin/reports/${created.body.id}/resolve`, root)
        .send({ note: 'We refunded the difference' })
        .expect(200);
      const seen = (await mine(id, alice).expect(200)).body[0];
      expect(reportSchema.parse(seen)).toMatchObject({
        id: created.body.id,
        status: 'resolved',
        resolutionNote: 'We refunded the difference',
        resolvedAt: new Date(now).toISOString(),
      });
      const [row] = await database.db.select().from(reports).where(eq(reports.id, created.body.id));
      expect(row?.status).toBe('resolved');
    });
  });
});
