import {
  driverJobSchema,
  estimateRoadDistanceM,
  offerSchema,
  RECEIPT_NO_PATTERN,
  receiptSchema,
  suggestFare,
  towRequestPageSchema,
  towRequestSchema,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { payments, towRequests, users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };

const CUSTOMER_PHONE = '+21698111111';
const DRIVER_PHONE = '+21698222222';
const PLATE = '1 TUN 2';

describe('cash payment, receipts, confirm and dispute (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now });
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';
  const zed = 'token-zed:zed@example.com';

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  const profiles = async (customer: string, driver: string, name: string) => {
    await api('put', '/me/customer-profile', customer)
      .send({ fullName: `${name} Customer`, phone: CUSTOMER_PHONE })
      .expect(200);
    await api('put', '/me/driver-profile', driver)
      .send({
        fullName: `${name} Driver`,
        phone: DRIVER_PHONE,
        truckType: 'flatbed',
        plateNumber: PLATE,
      })
      .expect(200);
    await api('put', '/driver/presence', driver)
      .send({ online: true, location: laMarsa })
      .expect(200);
  };

  /** `customer`'s request, accepted from `driver` and advanced to `towing`. Returns its id. */
  const tripToTowing = async (customer: string, driver: string) => {
    // Presence goes stale as the clock moves on.
    await api('put', '/driver/presence', driver)
      .send({ online: true, location: laMarsa })
      .expect(200);
    const created = await api('post', '/tow-requests', customer)
      .send({
        pickup: tunis,
        dropoff: sousse,
        vehicleType: 'car',
        problemType: 'breakdown',
        proposedFare: suggested,
      })
      .expect(201);
    const offer = offerSchema.parse(
      (
        await api('post', `/tow-requests/${created.body.id}/offers`, driver)
          .send({ fare: suggested })
          .expect(201)
      ).body,
    );
    await api('post', `/offers/${offer.id}/accept`, customer).expect(200);
    for (const stage of ['en_route', 'arrived', 'towing']) {
      await api('post', '/driver/job/stage', driver).send({ stage }).expect(200);
    }
    return created.body.id as string;
  };
  const complete = (driver: string) =>
    api('post', '/driver/job/complete', driver).send({ cashReceived: true });

  /** Alice and Dan (with Eve and Zed as bystanders), the trip at `towing`. */
  const towing = async () => {
    await profiles(alice, dan, 'Ann');
    await api('put', '/me/driver-profile', eve)
      .send({
        fullName: 'Eve Driver',
        phone: DRIVER_PHONE,
        truckType: 'flatbed',
        plateNumber: 'EVE 1',
      })
      .expect(200);
    await api('put', '/me/customer-profile', zed)
      .send({ fullName: 'Zed Customer', phone: '+21698333333' })
      .expect(200);
    return tripToTowing(alice, dan);
  };
  /** The trip, completed. */
  const completed = async () => {
    const id = await towing();
    const res = await complete(dan).expect(200);
    return { id, res };
  };
  const row = async (id: string) => {
    const [r] = await database.db.select().from(towRequests).where(eq(towRequests.id, id));
    return r!;
  };
  const payment = async (id: string) => {
    const [row] = await database.db.select().from(payments).where(eq(payments.requestId, id));
    return row;
  };

  describe('POST /driver/job/complete', () => {
    it('needs { cashReceived: true } and leaves the job alone otherwise', async () => {
      const id = await towing();
      await api('post', '/driver/job/complete', dan).expect(400);
      await api('post', '/driver/job/complete', dan).send({}).expect(400);
      await api('post', '/driver/job/complete', dan).send({ cashReceived: false }).expect(400);
      await api('post', '/driver/job/complete', dan).send({ cashReceived: 'yes' }).expect(400);
      expect(await payment(id)).toBeUndefined();
      const job = driverJobSchema.parse((await api('get', '/driver/job', dan).expect(200)).body);
      expect(job.status).toBe('assigned');
    });

    it('records the agreed fare as a driver-confirmed cash payment', async () => {
      const { id, res } = await completed();
      const body = towRequestSchema.parse(res.body);
      expect(body).toMatchObject({
        id,
        status: 'completed',
        payment: { status: 'driver_confirmed', amountTnd: suggested },
      });
      expect(body.payment?.receiptNo).toMatch(RECEIPT_NO_PATTERN);

      const stored = await payment(id);
      expect(stored).toMatchObject({
        amountTnd: suggested,
        method: 'cash',
        status: 'driver_confirmed',
        receiptNo: body.payment?.receiptNo,
        driverConfirmedAt: now,
        customerAnsweredAt: null,
        disputeNote: null,
      });
    });

    it('records nothing without a job or before towing, and nothing twice', async () => {
      await profiles(alice, dan, 'Ann');
      await complete(dan).expect(404);

      const created = await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201);
      const offer = offerSchema.parse(
        (
          await api('post', `/tow-requests/${created.body.id}/offers`, dan)
            .send({ fare: suggested })
            .expect(201)
        ).body,
      );
      await api('post', `/offers/${offer.id}/accept`, alice).expect(200);
      await complete(dan).expect(409);
      expect(await database.db.select().from(payments)).toHaveLength(0);

      for (const stage of ['en_route', 'arrived', 'towing']) {
        await api('post', '/driver/job/stage', dan).send({ stage }).expect(200);
      }
      await complete(dan).expect(200);
      await complete(dan).expect(404);
      expect(await database.db.select().from(payments)).toHaveLength(1);
    });

    it('puts the payment summary on active and history, and ends the job', async () => {
      const { id, res } = await completed();
      const expected = { status: 'driver_confirmed', amountTnd: suggested };

      const active = towRequestSchema.parse((await api('get', '/tow-requests/active', alice)).body);
      expect(active.payment).toEqual({ ...expected, receiptNo: res.body.payment.receiptNo });

      const history = towRequestPageSchema.parse(
        (await api('get', '/tow-requests', alice).expect(200)).body,
      );
      expect(history.items.find((item) => item.id === id)?.payment).toEqual(active.payment);
      await api('get', '/driver/job', dan).expect(204);
    });

    it('gives requests that are not completed no payment', async () => {
      await profiles(alice, dan, 'Ann');
      await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201);
      const active = towRequestSchema.parse((await api('get', '/tow-requests/active', alice)).body);
      expect(active.payment ?? null).toBeNull();
    });
  });

  describe('receipt numbers', () => {
    it('are DPN-<year>-<six digits>, increasing', async () => {
      const first = await completed();
      const a = first.res.body.payment.receiptNo as string;
      expect(a).toMatch(/^DPN-2026-\d{6}$/);

      now = new Date(now.getTime() + 20 * 60_000);
      const id = await tripToTowing(alice, dan);
      const b = (await complete(dan).expect(200)).body.payment.receiptNo as string;
      expect(b).toMatch(/^DPN-2026-\d{6}$/);
      expect(Number(b.slice(-6))).toBeGreaterThan(Number(a.slice(-6)));
      expect((await payment(id))?.receiptNo).toBe(b);
    });

    it('take the year from completed_at in Africa/Tunis (UTC+1)', async () => {
      await profiles(alice, dan, 'Ann');
      // 22:59:59 UTC on 31 Dec is 23:59:59 in Tunis: still 2026.
      now = new Date('2026-12-31T22:59:00.000Z');
      await tripToTowing(alice, dan);
      now = new Date('2026-12-31T22:59:59.000Z');
      const before = (await complete(dan).expect(200)).body.payment.receiptNo as string;
      expect(before).toMatch(/^DPN-2026-/);

      // 23:00:00 UTC is already 1 Jan in Tunis.
      now = new Date('2026-12-31T23:00:00.000Z');
      await tripToTowing(alice, dan);
      const after = (await complete(dan).expect(200)).body.payment.receiptNo as string;
      expect(after).toMatch(/^DPN-2027-/);
      // One sequence for all years: the count carries on.
      expect(Number(after.slice(-6))).toBeGreaterThan(Number(before.slice(-6)));
    });

    it('are unique under concurrent completions', async () => {
      const people = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({
        customer: `token-c${name}:c${name}@example.com`,
        driver: `token-d${name}:d${name}@example.com`,
        name,
      }));
      for (const { customer, driver, name } of people) await profiles(customer, driver, name);
      for (const { customer, driver } of people) await tripToTowing(customer, driver);

      const results = await Promise.all(people.map(({ driver }) => complete(driver)));
      expect(results.map((res) => res.status)).toEqual(people.map(() => 200));
      const numbers = results.map((res) => res.body.payment.receiptNo as string);
      expect(new Set(numbers).size).toBe(people.length);
      for (const number of numbers) expect(number).toMatch(RECEIPT_NO_PATTERN);
      expect(await database.db.select().from(payments)).toHaveLength(people.length);
    });
  });

  describe('POST /tow-requests/:id/payment/confirm', () => {
    it('needs a token', async () => {
      await api(
        'post',
        '/tow-requests/00000000-0000-4000-8000-000000000000/payment/confirm',
      ).expect(401);
    });

    it('confirms for the owner, once', async () => {
      const { id } = await completed();
      now = new Date(now.getTime() + 60_000);
      const res = await api('post', `/tow-requests/${id}/payment/confirm`, alice).expect(200);
      expect(towRequestSchema.parse(res.body)).toMatchObject({
        id,
        status: 'completed',
        payment: { status: 'customer_confirmed', amountTnd: suggested },
      });
      expect(await payment(id)).toMatchObject({
        status: 'customer_confirmed',
        customerAnsweredAt: now,
      });
      const active = towRequestSchema.parse((await api('get', '/tow-requests/active', alice)).body);
      expect(active.payment?.status).toBe('customer_confirmed');

      await api('post', `/tow-requests/${id}/payment/confirm`, alice).expect(409);
      await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: 'Too late' })
        .expect(409);
      expect((await payment(id))?.status).toBe('customer_confirmed');
    });

    it('is 404 for anyone but the customer', async () => {
      const { id } = await completed();
      await api('post', `/tow-requests/${id}/payment/confirm`, dan).expect(404);
      await api('post', `/tow-requests/${id}/payment/confirm`, eve).expect(404);
      await api('post', `/tow-requests/${id}/payment/confirm`, zed).expect(404);
      await api('post', `/tow-requests/${id}/payment/confirm`, 'token-nobody').expect(404);
      await api('post', '/tow-requests/not-a-uuid/payment/confirm', alice).expect(404);
      await api(
        'post',
        '/tow-requests/00000000-0000-4000-8000-000000000000/payment/confirm',
        alice,
      ).expect(404);
      expect((await payment(id))?.status).toBe('driver_confirmed');
    });

    it('is 409 before the request is completed', async () => {
      const id = await towing();
      await api('post', `/tow-requests/${id}/payment/confirm`, alice).expect(409);
      await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: 'Not yet' })
        .expect(409);
    });

    it('is 409 for a cancelled request', async () => {
      await profiles(alice, dan, 'Ann');
      const created = await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201);
      await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(200);
      await api('post', `/tow-requests/${created.body.id}/payment/confirm`, alice).expect(409);
    });
  });

  describe('POST /tow-requests/:id/payment/dispute', () => {
    it('needs a token and a note', async () => {
      const { id } = await completed();
      await api('post', `/tow-requests/${id}/payment/dispute`).send({ note: 'x' }).expect(401);
      await api('post', `/tow-requests/${id}/payment/dispute`, alice).expect(400);
      await api('post', `/tow-requests/${id}/payment/dispute`, alice).send({}).expect(400);
      await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: '   ' })
        .expect(400);
      await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: 'x'.repeat(501) })
        .expect(400);
      expect((await payment(id))?.status).toBe('driver_confirmed');
    });

    it('records the trimmed note for the owner, once, and never blocks the driver', async () => {
      const { id } = await completed();
      now = new Date(now.getTime() + 60_000);
      const res = await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: '  He asked for more  ' })
        .expect(200);
      expect(towRequestSchema.parse(res.body)).toMatchObject({
        id,
        status: 'completed',
        payment: { status: 'disputed', amountTnd: suggested },
      });
      expect(await payment(id)).toMatchObject({
        status: 'disputed',
        customerAnsweredAt: now,
        disputeNote: 'He asked for more',
      });
      // The note is for support: the apps' payloads never carry it.
      expect(JSON.stringify(res.body)).not.toContain('He asked for more');

      await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: 'Again' })
        .expect(409);
      await api('post', `/tow-requests/${id}/payment/confirm`, alice).expect(409);
      expect((await payment(id))?.disputeNote).toBe('He asked for more');
      // The driver is not blocked: they can go online and take another job.
      await api('put', '/driver/presence', dan)
        .send({ online: true, location: laMarsa })
        .expect(200);
      await api('get', '/driver/job', dan).expect(204);
    });

    it('is 404 for anyone but the customer', async () => {
      const { id } = await completed();
      for (const token of [dan, eve, zed]) {
        await api('post', `/tow-requests/${id}/payment/dispute`, token)
          .send({ note: 'Nope' })
          .expect(404);
      }
      await api('post', '/tow-requests/not-a-uuid/payment/dispute', alice)
        .send({ note: 'Nope' })
        .expect(404);
      expect((await payment(id))?.status).toBe('driver_confirmed');
    });
  });

  describe('GET /tow-requests/:id/receipt', () => {
    it('needs a token', async () => {
      await api('get', '/tow-requests/00000000-0000-4000-8000-000000000000/receipt').expect(401);
    });

    it('is the same for the customer and the assigned driver, without phone or plate', async () => {
      const { id, res } = await completed();
      await api('post', `/tow-requests/${id}/payment/confirm`, alice).expect(200);

      const forCustomer = await api('get', `/tow-requests/${id}/receipt`, alice).expect(200);
      const forDriver = await api('get', `/tow-requests/${id}/receipt`, dan).expect(200);
      expect(forDriver.body).toEqual(forCustomer.body);

      const receipt = receiptSchema.parse(forCustomer.body);
      expect(receipt).toMatchObject({
        receiptNo: res.body.payment.receiptNo,
        completedAt: now.toISOString(),
        pickup: tunis,
        dropoff: sousse,
        distanceM: (await row(id)).distanceM,
        vehicleType: 'car',
        problemType: 'breakdown',
        agreedFare: suggested,
        method: 'cash',
        driver: { fullName: 'Ann Driver', truckType: 'flatbed' },
        customer: { fullName: 'Ann Customer' },
      });
      expect(receipt.assignedAt).toBeTruthy();
      expect(receipt.enRouteAt).toBeTruthy();
      expect(receipt.arrivedAt).toBeTruthy();
      expect(receipt.towingAt).toBeTruthy();

      // Check the raw JSON, not only what the schema keeps after stripping unknown keys.
      const raw = JSON.stringify(forCustomer.body);
      for (const secret of [CUSTOMER_PHONE, DRIVER_PHONE, PLATE, '"phone"', 'plateNumber']) {
        expect(raw).not.toContain(secret);
      }
      for (const key of ['phone', 'plateNumber', 'plate']) {
        expect(forCustomer.body.driver).not.toHaveProperty(key);
        expect(forCustomer.body.customer).not.toHaveProperty(key);
        expect(forCustomer.body).not.toHaveProperty(key);
      }
    });

    it('is the same for a disputed payment, without the note', async () => {
      const { id } = await completed();
      await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: 'private grievance' })
        .expect(200);
      const res = await api('get', `/tow-requests/${id}/receipt`, dan).expect(200);
      receiptSchema.parse(res.body);
      expect(JSON.stringify(res.body)).not.toContain('private grievance');
    });

    it('is 404 for anyone else', async () => {
      const { id } = await completed();
      for (const token of [eve, zed, 'token-nobody']) {
        await api('get', `/tow-requests/${id}/receipt`, token).expect(404);
      }
      await api('get', '/tow-requests/not-a-uuid/receipt', alice).expect(404);
      await api('get', '/tow-requests/00000000-0000-4000-8000-000000000000/receipt', alice).expect(
        404,
      );
    });

    it('is 404 until the request is completed', async () => {
      const id = await towing();
      await api('get', `/tow-requests/${id}/receipt`, alice).expect(404);
      await api('get', `/tow-requests/${id}/receipt`, dan).expect(404);
      await complete(dan).expect(200);
      await api('get', `/tow-requests/${id}/receipt`, alice).expect(200);
    });

    it('is 404 for a cancelled request', async () => {
      await profiles(alice, dan, 'Ann');
      const created = await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggested,
        })
        .expect(201);
      await api('post', `/tow-requests/${created.body.id}/cancel`, alice).expect(200);
      await api('get', `/tow-requests/${created.body.id}/receipt`, alice).expect(404);
    });

    it('is 404 for a completed request that has no payment (from before payments)', async () => {
      const { id } = await completed();
      await database.db.delete(payments).where(eq(payments.requestId, id));
      await api('get', `/tow-requests/${id}/receipt`, alice).expect(404);
      const [row] = await database.db.select().from(towRequests).where(eq(towRequests.id, id));
      expect(row?.status).toBe('completed');
      // The request itself still reads fine, with no payment.
      const active = towRequestSchema.parse((await api('get', '/tow-requests/active', alice)).body);
      expect(active.payment ?? null).toBeNull();
    });
  });
});
