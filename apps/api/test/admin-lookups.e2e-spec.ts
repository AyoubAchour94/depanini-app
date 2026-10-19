import {
  adminDisputeItemSchema,
  adminDisputePageSchema,
  adminReportPageSchema,
  adminReportSchema,
  adminTripDetailSchema,
  adminTripPageSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  auditPageSchema,
  estimateRoadDistanceM,
  suggestFare,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { adminActions, payments, reports, users } from '../src/db/schema.js';
import { approveDriverByToken } from './support/approve-driver.js';
import { adminToken, createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Avenue Habib Bourguiba, Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };
const unknownId = '00000000-0000-4000-8000-000000000000';

type Method = 'get' | 'post' | 'put' | 'delete';

const root = adminToken('root', 'root@depanini.test');
const alice = 'token-alice:Alice.Smith@Example.com';
const bob = 'token-bob:bob@example.com';
const dan = 'token-dan:dan@example.com';
const eve = 'token-eve:eve@example.com';

describe('admin: users, trips, reports and disputes (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now });
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    await database.db.delete(users);
    await database.db.delete(adminActions);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const api = (method: Method, path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const get = async (path: string) => (await api('get', path, root).expect(200)).body;
  const userId = async (token: string) => (await api('get', '/me', token).expect(200)).body.id;
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  const customer = (token: string, fullName: string, phone: string) =>
    api('put', '/me/customer-profile', token).send({ fullName, phone }).expect(200);
  const driver = async (token: string, fullName: string, phone: string) => {
    await api('put', '/me/driver-profile', token)
      .send({ fullName, phone, truckType: 'flatbed', plateNumber: `${fullName} 1` })
      .expect(200);
    await approveDriverByToken(database.db, token);
    await api('put', '/driver/presence', token)
      .send({ online: true, location: laMarsa })
      .expect(200);
  };
  const open = async (token: string) =>
    (
      await api('post', '/tow-requests', token)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          note: 'Engine died',
          proposedFare: suggested,
        })
        .expect(201)
    ).body.id as string;
  const offer = async (token: string, requestId: string, fare = suggested) =>
    (await api('post', `/tow-requests/${requestId}/offers`, token).send({ fare }).expect(201)).body
      .id as string;

  /**
   * Alice's trip with Dan, completed and disputed, rated both ways with comments, after
   * Eve also offered. Returns its id.
   */
  const disputedTrip = async () => {
    const id = await open(alice);
    await offer(eve, id, suggested + 10);
    await api('post', `/offers/${await offer(dan, id)}/accept`, alice).expect(200);
    for (const stage of ['en_route', 'arrived', 'towing']) {
      now = new Date(now.getTime() + 60_000);
      await api('post', '/driver/job/stage', dan).send({ stage }).expect(200);
    }
    now = new Date(now.getTime() + 60_000);
    await api('post', '/driver/job/complete', dan).send({ cashReceived: true }).expect(200);
    await api('post', `/tow-requests/${id}/payment/dispute`, alice)
      .send({ note: 'I paid less' })
      .expect(200);
    await api('post', `/tow-requests/${id}/rating`, alice)
      .send({ stars: 2, tags: ['late'], comment: 'Took ages, private note' })
      .expect(201);
    await api('post', `/tow-requests/${id}/rating`, dan)
      .send({ stars: 4, tags: ['clear_location'], comment: 'Fine customer' })
      .expect(201);
    return id;
  };
  /** A report row, as `POST /tow-requests/:id/report` (#112) will write it. */
  const report = async (
    requestId: string,
    token: string,
    reporterRole: 'customer' | 'driver',
    createdAt = now,
  ) => {
    const [row] = await database.db
      .insert(reports)
      .values({
        requestId,
        reporterUserId: await userId(token),
        reporterRole,
        category: 'overcharged',
        note: `Report by ${reporterRole}`,
        createdAt,
      })
      .returning({ id: reports.id });
    return row!.id;
  };

  const setUp = async () => {
    await customer(alice, 'Alice Smith', '+21698111111');
    await customer(bob, 'Bob Jones', '+21655333333');
    await driver(dan, 'Dan Driver', '+21698222222');
    await driver(eve, 'Eve Driver', '+21620444444');
  };

  describe('GET /admin/users', () => {
    it('finds accounts by email prefix, in any case', async () => {
      await setUp();
      const page = adminUserPageSchema.parse(await get('/admin/users?q=ALICE.s'));
      expect(page.items).toEqual([
        {
          id: await userId(alice),
          email: 'Alice.Smith@Example.com',
          phone: '+21698111111',
          customerName: 'Alice Smith',
          driverName: null,
          createdAt: expect.any(String),
        },
      ]);
      expect((await get('/admin/users?q=alice.smith@example.com')).items).toHaveLength(1);
      expect((await get('/admin/users?q=smith')).items).toHaveLength(0);
    });

    it('finds accounts by phone prefix, with or without +216', async () => {
      await setUp();
      const names = async (q: string) =>
        (await get(`/admin/users?q=${encodeURIComponent(q)}`)).items.map(
          (u: { customerName?: string; driverName?: string }) => u.customerName ?? u.driverName,
        );
      expect(await names('+2169811')).toEqual(['Alice Smith']);
      expect(await names('9822')).toEqual(['Dan Driver']);
      expect(await names('216 20 44')).toEqual(['Eve Driver']);
      expect((await names('98')).sort()).toEqual(['Alice Smith', 'Dan Driver']);
    });

    it('treats LIKE wildcards literally', async () => {
      await setUp();
      expect((await get('/admin/users?q=%25')).items).toEqual([]);
      expect((await get('/admin/users?q=_')).items).toEqual([]);
    });

    it('lists every account newest first without a search, page by page', async () => {
      await setUp();
      const first = adminUserPageSchema.parse(await get('/admin/users?limit=3'));
      expect(first.items).toHaveLength(3);
      const second = adminUserPageSchema.parse(
        await get(`/admin/users?limit=3&cursor=${first.nextCursor}`),
      );
      // Alice, Bob, Dan and Eve (the admin's own account only comes with a first change).
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((u) => u.id);
      expect(new Set(ids).size).toBe(4);
    });

    it('rejects a search that is too long', async () => {
      await api('get', `/admin/users?q=${'a'.repeat(101)}`, root).expect(400);
    });
  });

  describe('GET /admin/users/:id', () => {
    it('returns the account, its profiles, counts and recent trips', async () => {
      await setUp();
      const id = await disputedTrip();
      await report(id, alice, 'customer');
      await report(id, dan, 'driver');

      const alicesDetail = adminUserDetailSchema.parse(
        await get(`/admin/users/${await userId(alice)}`),
      );
      expect(alicesDetail).toMatchObject({
        email: 'Alice.Smith@Example.com',
        customerProfile: { fullName: 'Alice Smith', phone: '+21698111111' },
        driverProfile: null,
        counts: { tripsAsCustomer: 1, tripsAsDriver: 0, reportsMade: 1, reportsAgainst: 1 },
      });
      expect(alicesDetail.recentTrips).toEqual([
        expect.objectContaining({ id, status: 'completed', customerName: 'Alice Smith' }),
      ]);

      const dansDetail = adminUserDetailSchema.parse(
        await get(`/admin/users/${await userId(dan)}`),
      );
      expect(dansDetail).toMatchObject({
        customerProfile: null,
        driverProfile: { fullName: 'Dan Driver', verificationStatus: 'approved' },
        counts: { tripsAsCustomer: 0, tripsAsDriver: 1, reportsMade: 1, reportsAgainst: 1 },
      });
      // Eve offered but did not get the job.
      const evesDetail = adminUserDetailSchema.parse(
        await get(`/admin/users/${await userId(eve)}`),
      );
      expect(evesDetail.counts).toEqual({
        tripsAsCustomer: 0,
        tripsAsDriver: 0,
        reportsMade: 0,
        reportsAgainst: 0,
      });
      expect(evesDetail.recentTrips).toEqual([]);
    });

    it('is 404 for an unknown or malformed id', async () => {
      await api('get', `/admin/users/${unknownId}`, root).expect(404);
      await api('get', '/admin/users/nope', root).expect(404);
    });
  });

  describe('GET /admin/trips', () => {
    it('lists trips newest first and filters by status, counting stale open ones as expired', async () => {
      await setUp();
      const completed = await disputedTrip();
      now = new Date('2026-06-01T12:00:00.000Z');
      const stale = await open(bob);
      now = new Date('2026-06-01T13:00:00.000Z');

      const all = adminTripPageSchema.parse(await get('/admin/trips'));
      expect(all.items.map((t) => [t.id, t.status])).toEqual([
        [stale, 'expired'],
        [completed, 'completed'],
      ]);
      expect(all.items[1]).toMatchObject({
        customerName: 'Alice Smith',
        driverName: 'Dan Driver',
        pickupAddress: tunis.address,
        agreedFare: suggested,
      });
      const ids = async (query: string) =>
        (await get(`/admin/trips?${query}`)).items.map((t: { id: string }) => t.id);
      expect(await ids('status=expired')).toEqual([stale]);
      expect(await ids('status=open')).toEqual([]);
      expect(await ids('status=completed')).toEqual([completed]);
      await api('get', '/admin/trips?status=lost', root).expect(400);
    });

    it('filters by a date range (UTC days, both ends included)', async () => {
      await setUp();
      const ids: Record<string, string> = {};
      for (const day of ['2026-05-30', '2026-05-31', '2026-06-01']) {
        now = new Date(`${day}T23:30:00.000Z`);
        ids[day] = await open(bob);
      }
      now = new Date('2026-06-02T00:00:00.000Z');
      const found = async (query: string) =>
        (await get(`/admin/trips?${query}`)).items.map((t: { id: string }) => t.id);
      expect(await found('from=2026-05-31')).toEqual([ids['2026-06-01'], ids['2026-05-31']]);
      expect(await found('to=2026-05-31')).toEqual([ids['2026-05-31'], ids['2026-05-30']]);
      expect(await found('from=2026-05-31&to=2026-05-31')).toEqual([ids['2026-05-31']]);
      expect(await found('from=2026-06-02')).toEqual([]);
      await api('get', '/admin/trips?from=yesterday', root).expect(400);
      await api('get', '/admin/trips?from=2026-02-31', root).expect(400);
    });

    it('searches by trip id, receipt number, names, emails and phones', async () => {
      await setUp();
      const id = await disputedTrip();
      now = new Date('2026-06-01T12:00:00.000Z');
      await open(bob);
      const [payment] = await database.db
        .select({ receiptNo: payments.receiptNo })
        .from(payments)
        .where(eq(payments.requestId, id));
      const ids = async (q: string) =>
        (await get(`/admin/trips?q=${encodeURIComponent(q)}`)).items.map(
          (t: { id: string }) => t.id,
        );
      for (const q of [
        id,
        payment!.receiptNo.toLowerCase(),
        'alice s',
        'DAN dr',
        'alice.smith@',
        'dan@',
        '98111',
        '+21698222',
      ]) {
        expect([q, await ids(q)]).toEqual([q, [id]]);
      }
      expect(await ids('eve')).toEqual([]); // Eve only offered
      expect(await ids(unknownId)).toEqual([]);
    });
  });

  describe('GET /admin/trips/:id', () => {
    it('returns the timeline, offers, payment with the dispute, both ratings with comments and reports', async () => {
      await setUp();
      const id = await disputedTrip();
      const reportId = await report(id, alice, 'customer');

      const detail = adminTripDetailSchema.parse(await get(`/admin/trips/${id}`));
      expect(detail).toMatchObject({
        id,
        status: 'completed',
        problemType: 'breakdown',
        vehicleType: 'car',
        note: 'Engine died',
        pickup: tunis,
        dropoff: sousse,
        suggestedFare: expect.any(Number),
        proposedFare: suggested,
        agreedFare: suggested,
        tripStage: 'towing',
        customer: { userId: await userId(alice), fullName: 'Alice Smith', phone: '+21698111111' },
        driver: {
          userId: await userId(dan),
          fullName: 'Dan Driver',
          phone: '+21698222222',
          plateNumber: 'DAN DRIVER 1',
        },
        assignedAt: '2026-06-01T10:00:00.000Z',
        enRouteAt: '2026-06-01T10:01:00.000Z',
        arrivedAt: '2026-06-01T10:02:00.000Z',
        towingAt: '2026-06-01T10:03:00.000Z',
        completedAt: '2026-06-01T10:04:00.000Z',
        cancelledAt: null,
        payment: {
          status: 'disputed',
          method: 'cash',
          amountTnd: suggested,
          disputeNote: 'I paid less',
          resolutionNote: null,
          resolvedAt: null,
        },
        customerRating: { stars: 2, tags: ['late'], comment: 'Took ages, private note' },
        driverRating: { stars: 4, tags: ['clear_location'], comment: 'Fine customer' },
        reports: [
          {
            id: reportId,
            requestId: id,
            category: 'overcharged',
            note: 'Report by customer',
            status: 'open',
            reporterRole: 'customer',
            reporterName: 'Alice Smith',
            resolvedBy: null,
          },
        ],
      });
      expect(detail.offers.map((o) => [o.driverName, o.fare, o.status]).sort()).toEqual([
        ['Dan Driver', suggested, 'accepted'],
        ['Eve Driver', suggested + 10, 'rejected'],
      ]);
    });

    it('shows a cancelled trip without a payment or ratings', async () => {
      await setUp();
      const id = await open(bob);
      await api('post', `/tow-requests/${id}/cancel`, bob).send({}).expect(200);
      const detail = adminTripDetailSchema.parse(await get(`/admin/trips/${id}`));
      expect(detail).toMatchObject({
        status: 'cancelled',
        cancelledAt: now.toISOString(),
        driver: null,
        payment: null,
        customerRating: null,
        driverRating: null,
        offers: [],
        reports: [],
      });
    });

    it('is 404 for an unknown or malformed id', async () => {
      await api('get', `/admin/trips/${unknownId}`, root).expect(404);
      await api('get', '/admin/trips/nope', root).expect(404);
    });
  });

  describe('reports queue', () => {
    it('lists open reports oldest first, and resolved ones once resolved', async () => {
      await setUp();
      const id = await disputedTrip();
      const older = await report(id, dan, 'driver', new Date('2026-06-01T11:00:00.000Z'));
      const newer = await report(id, alice, 'customer', new Date('2026-06-01T12:00:00.000Z'));

      const queue = adminReportPageSchema.parse(await get('/admin/reports?status=open'));
      expect(queue.items.map((r) => r.id)).toEqual([older, newer]);
      expect(queue.items[0]).toMatchObject({
        reporterName: 'Dan Driver',
        pickupAddress: tunis.address,
      });
      const paged = adminReportPageSchema.parse(await get('/admin/reports?status=open&limit=1'));
      expect(paged.items.map((r) => r.id)).toEqual([older]);
      const rest = adminReportPageSchema.parse(
        await get(`/admin/reports?status=open&limit=1&cursor=${paged.nextCursor}`),
      );
      expect(rest.items.map((r) => r.id)).toEqual([newer]);
      expect(rest.nextCursor).toBeNull();

      now = new Date('2026-06-02T09:00:00.000Z');
      const res = await api('post', `/admin/reports/${older}/resolve`, root)
        .send({ note: '  Refunded the difference ' })
        .expect(200);
      expect(adminReportSchema.parse(res.body)).toMatchObject({
        id: older,
        status: 'resolved',
        resolutionNote: 'Refunded the difference',
        resolvedBy: await userId(root),
        resolvedByEmail: 'root@depanini.test',
        resolvedAt: now.toISOString(),
      });
      expect(
        (await get('/admin/reports?status=open')).items.map((r: { id: string }) => r.id),
      ).toEqual([newer]);
      expect(
        (await get('/admin/reports?status=resolved')).items.map((r: { id: string }) => r.id),
      ).toEqual([older]);
      expect((await get('/admin/reports')).items).toHaveLength(2);

      const audit = auditPageSchema.parse(await get('/admin/audit'));
      expect(audit.items).toEqual([
        expect.objectContaining({
          action: 'report_resolved',
          targetType: 'report',
          targetId: older,
          details: { note: 'Refunded the difference', requestId: id },
        }),
      ]);
    });

    it('resolves once: 409 the second time, 404 for an unknown report, 400 without a note', async () => {
      await setUp();
      const id = await disputedTrip();
      const reportId = await report(id, alice, 'customer');
      await api('post', `/admin/reports/${reportId}/resolve`, root).send({ note: '' }).expect(400);
      await api('post', `/admin/reports/${reportId}/resolve`, root)
        .send({ note: 'x'.repeat(1001) })
        .expect(400);
      await api('post', `/admin/reports/${reportId}/resolve`, root)
        .send({ note: 'Done' })
        .expect(200);
      await api('post', `/admin/reports/${reportId}/resolve`, root)
        .send({ note: 'Again' })
        .expect(409);
      await api('post', `/admin/reports/${unknownId}/resolve`, root)
        .send({ note: 'Done' })
        .expect(404);
      await api('post', '/admin/reports/nope/resolve', root).send({ note: 'Done' }).expect(404);
      expect((await get('/admin/audit')).items).toHaveLength(1);
      await api('get', '/admin/reports?status=closed', root).expect(400);
    });
  });

  describe('payment disputes queue', () => {
    it('lists open disputes, resolves one with a note kept on the payment', async () => {
      await setUp();
      const id = await disputedTrip();

      const queue = adminDisputePageSchema.parse(await get('/admin/disputes?status=open'));
      expect(queue.items).toEqual([
        {
          requestId: id,
          receiptNo: expect.stringMatching(/^DPN-2026-\d{6}$/),
          amountTnd: suggested,
          disputeNote: 'I paid less',
          customerName: 'Alice Smith',
          driverName: 'Dan Driver',
          status: 'open',
          resolutionNote: null,
          resolvedByEmail: null,
          disputedAt: expect.any(String),
          resolvedAt: null,
        },
      ]);

      now = new Date('2026-06-02T09:00:00.000Z');
      const res = await api('post', `/admin/disputes/${id}/resolve`, root)
        .send({ note: 'Driver confirmed the amount' })
        .expect(200);
      expect(adminDisputeItemSchema.parse(res.body)).toMatchObject({
        status: 'resolved',
        resolutionNote: 'Driver confirmed the amount',
        resolvedByEmail: 'root@depanini.test',
        resolvedAt: now.toISOString(),
      });
      expect((await get('/admin/disputes?status=open')).items).toEqual([]);
      expect((await get('/admin/disputes?status=resolved')).items).toHaveLength(1);
      const detail = adminTripDetailSchema.parse(await get(`/admin/trips/${id}`));
      expect(detail.payment).toMatchObject({
        status: 'disputed',
        resolutionNote: 'Driver confirmed the amount',
        resolvedAt: now.toISOString(),
      });

      const audit = auditPageSchema.parse(await get('/admin/audit'));
      expect(audit.items).toEqual([
        expect.objectContaining({
          adminUserId: await userId(root),
          action: 'dispute_resolved',
          targetType: 'dispute',
          targetId: id,
          details: { note: 'Driver confirmed the amount' },
        }),
      ]);
    });

    it('resolves once, and only a disputed payment', async () => {
      await setUp();
      const id = await disputedTrip();
      const open = await (async () => {
        now = new Date('2026-06-01T12:00:00.000Z');
        const requestId = await api('post', '/tow-requests', bob)
          .send({
            pickup: tunis,
            dropoff: sousse,
            vehicleType: 'car',
            problemType: 'battery',
            proposedFare: suggested,
          })
          .expect(201);
        return requestId.body.id as string;
      })();
      await api('post', `/admin/disputes/${id}/resolve`, root).send({ note: '' }).expect(400);
      await api('post', `/admin/disputes/${id}/resolve`, root).send({ note: 'Ok' }).expect(200);
      await api('post', `/admin/disputes/${id}/resolve`, root).send({ note: 'Ok' }).expect(409);
      await api('post', `/admin/disputes/${open}/resolve`, root).send({ note: 'Ok' }).expect(404);
      await api('post', `/admin/disputes/${unknownId}/resolve`, root)
        .send({ note: 'Ok' })
        .expect(404);
      expect((await get('/admin/audit')).items).toHaveLength(1);
    });
  });
});
