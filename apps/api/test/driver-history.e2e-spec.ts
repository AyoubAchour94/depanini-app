import {
  driverJobsPageSchema,
  earningsSchema,
  estimateRoadDistanceM,
  offerSchema,
  suggestFare,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';

import { payments, towRequests, users } from '../src/db/schema.js';
import { approveDriverByToken } from './support/approve-driver.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };

const CUSTOMER_PHONE = '+21698111111';
const DRIVER_PHONE = '+21698222222';

describe('driver jobs history and earnings (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-10T10:00:00.000Z');

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now });
  });

  beforeEach(async () => {
    now = new Date('2026-06-10T10:00:00.000Z');
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

  const api = (method: 'get' | 'post' | 'put', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');

  const setup = async () => {
    for (const [token, name] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
    ] as const) {
      await api('put', '/me/customer-profile', token)
        .send({ fullName: `${name} Customer`, phone: CUSTOMER_PHONE })
        .expect(200);
    }
    for (const [token, name] of [
      [dan, 'Dan'],
      [eve, 'Eve'],
    ] as const) {
      await api('put', '/me/driver-profile', token)
        .send({
          fullName: `${name} Driver`,
          phone: DRIVER_PHONE,
          truckType: 'flatbed',
          plateNumber: `${name} 1`,
        })
        .expect(200);
      await approveDriverByToken(database.db, token);
    }
  };

  /** A request from `customer` accepted by `driver`; returns its id. */
  const assign = async (customer: string, driver: string) => {
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
    return created.body.id as string;
  };

  /** A completed trip at the current clock; returns its id. */
  const completeTrip = async (customer = alice, driver = dan) => {
    const id = await assign(customer, driver);
    for (const stage of ['en_route', 'arrived', 'towing']) {
      await api('post', '/driver/job/stage', driver).send({ stage }).expect(200);
    }
    await api('post', '/driver/job/complete', driver).send({ cashReceived: true }).expect(200);
    return id;
  };

  const cancelTrip = async (customer = alice, driver = dan) => {
    const id = await assign(customer, driver);
    await api('post', `/tow-requests/${id}/cancel`, customer).send({}).expect(200);
    return id;
  };

  const jobs = async (query = '', token = dan) =>
    driverJobsPageSchema.parse((await api('get', `/driver/jobs${query}`, token).expect(200)).body);
  const earnings = async (token = dan) =>
    earningsSchema.parse((await api('get', '/driver/earnings', token).expect(200)).body);
  const at = (iso: string) => {
    now = new Date(iso);
  };
  const minutes = (n: number) => {
    now = new Date(now.getTime() + n * 60_000);
  };
  /** Walks every page of the history; returns the ids in order and the page count. */
  const walk = async (limit: number) => {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof jobs>> = await jobs(
        `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
      );
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    return { ids, pages };
  };

  describe('GET /driver/jobs', () => {
    it('needs a token and a driver profile', async () => {
      await api('get', '/driver/jobs').expect(401);
      await setup();
      await api('get', '/driver/jobs', 'token-nobody').expect(403);
      await api('get', '/driver/jobs', alice).expect(403);
    });

    it('is empty without finished jobs, and skips the assigned one', async () => {
      await setup();
      expect(await jobs()).toEqual({ items: [], nextCursor: null });
      await assign(alice, dan);
      expect(await jobs()).toEqual({ items: [], nextCursor: null });
    });

    it('lists my completed and cancelled jobs, newest first, with payments and no contact', async () => {
      await setup();
      const first = await completeTrip();
      minutes(30);
      const second = await cancelTrip();
      minutes(30);
      const third = await completeTrip();

      const page = await jobs();
      expect(page.items.map((item) => item.id)).toEqual([third, second, first]);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0]).toMatchObject({
        status: 'completed',
        payment: { status: 'driver_confirmed', amountTnd: suggested },
      });
      expect(page.items[1]).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'customer',
        payment: null,
      });
      for (const item of page.items) {
        expect(item).not.toHaveProperty('customer');
        const text = JSON.stringify(item);
        expect(text).not.toContain(CUSTOMER_PHONE);
        expect(text).not.toContain(DRIVER_PHONE);
        expect(text).not.toContain('Dan 1');
      }
    });

    it('only lists my own jobs', async () => {
      await setup();
      const mine = await completeTrip(alice, dan);
      const theirs = await completeTrip(bob, eve);
      expect((await jobs('', dan)).items.map((item) => item.id)).toEqual([mine]);
      expect((await jobs('', eve)).items.map((item) => item.id)).toEqual([theirs]);
    });

    it('orders by when each job ended, whether completed or cancelled', async () => {
      await setup();
      const completedFirst = await completeTrip();
      minutes(10);
      const cancelledLater = await cancelTrip();
      expect((await jobs()).items.map((item) => item.id)).toEqual([cancelledLater, completedFirst]);
    });

    it('pages without losing or repeating anything, ties included', async () => {
      await setup();
      const ids: string[] = [];
      // Three at the same instant, then two later.
      for (let i = 0; i < 3; i++) ids.push(await completeTrip());
      minutes(5);
      for (let i = 0; i < 2; i++) ids.push(await cancelTrip());
      const all = (await jobs('?limit=50')).items.map((item) => item.id);
      expect([...all].sort()).toEqual([...ids].sort());

      const { ids: seen, pages } = await walk(2);
      expect(pages).toBe(3);
      expect(seen).toEqual(all);
      expect((await walk(1)).ids).toEqual(all);
    });

    it('keeps rows that differ only in microseconds apart across pages', async () => {
      await setup();
      const ids = [await completeTrip(), await completeTrip(), await completeTrip()];
      // Same millisecond, different microseconds: a JS Date cursor would lose the order.
      for (const [i, id] of ids.entries()) {
        await database.db.execute(
          sql`update tow_requests set completed_at = ${`2026-06-10T10:00:00.000${i + 1}00Z`}::timestamptz where id = ${id}`,
        );
      }
      const { ids: seen } = await walk(1);
      expect(seen).toEqual([ids[2], ids[1], ids[0]]);
    });

    it('validates limit and cursor', async () => {
      await setup();
      await api('get', '/driver/jobs?limit=0', dan).expect(400);
      await api('get', '/driver/jobs?limit=51', dan).expect(400);
      await api('get', '/driver/jobs?limit=abc', dan).expect(400);
      await api('get', '/driver/jobs?cursor=garbage', dan).expect(400);
      await api('get', '/driver/jobs?limit=50', dan).expect(200);
    });

    it('drops jobs of a deleted driver from the history', async () => {
      await setup();
      await completeTrip();
      await api('get', '/me', dan).expect(200);
      await database.db.delete(users).where(eq(users.firebaseUid, 'dan'));
      expect(await database.db.select().from(towRequests)).toHaveLength(1);
      await api('put', '/me/driver-profile', dan)
        .send({
          fullName: 'Dan Again',
          phone: DRIVER_PHONE,
          truckType: 'flatbed',
          plateNumber: 'Dan 1',
        })
        .expect(200);
      expect((await jobs()).items).toEqual([]);
    });
  });

  describe('GET /driver/earnings', () => {
    it('needs a token and a driver profile', async () => {
      await api('get', '/driver/earnings').expect(401);
      await setup();
      await api('get', '/driver/earnings', alice).expect(403);
    });

    it('is zero without completed trips; cancelled ones do not count', async () => {
      await setup();
      const zero = { trips: 0, totalTnd: 0 };
      expect(await earnings()).toEqual({ today: zero, week: zero, month: zero });
      await cancelTrip();
      expect(await earnings()).toEqual({ today: zero, week: zero, month: zero });
    });

    it('sums the fares of my completed trips only', async () => {
      await setup();
      await completeTrip(alice, dan);
      await completeTrip(alice, dan);
      await completeTrip(bob, eve);
      const period = { trips: 2, totalTnd: 2 * suggested };
      expect(await earnings(dan)).toEqual({ today: period, week: period, month: period });
      const other = { trips: 1, totalTnd: suggested };
      expect(await earnings(eve)).toEqual({ today: other, week: other, month: other });
    });

    it('counts disputed payments too', async () => {
      await setup();
      const id = await completeTrip();
      await api('post', `/tow-requests/${id}/payment/dispute`, alice)
        .send({ note: 'I paid less' })
        .expect(200);
      const [stored] = await database.db.select().from(payments).where(eq(payments.requestId, id));
      expect(stored?.status).toBe('disputed');
      expect((await earnings()).today).toEqual({ trips: 1, totalTnd: suggested });
    });

    describe('periods in Africa/Tunis (UTC+1)', () => {
      const one = { trips: 1, totalTnd: suggested };
      const none = { trips: 0, totalTnd: 0 };
      /** Completes a trip at `completedAt` on a clean slate, then reads earnings at `readAt`. */
      const earnedAt = async (completedAt: string, readAt: string) => {
        await database.db.delete(users);
        await setup();
        at(completedAt);
        await completeTrip();
        at(readAt);
        return earnings();
      };

      // 2026-06-10 is a Wednesday; local midnight is 23:00Z the evening before.
      it('rolls today over at local midnight, not UTC midnight', async () => {
        // 22:59Z is 23:59 on Wed 10 June in Tunis.
        let result = await earnedAt('2026-06-10T22:59:00.000Z', '2026-06-10T22:59:30.000Z');
        expect(result.today).toEqual(one);
        // 23:00Z is 00:00 on Thu 11 June: a new day.
        result = await earnedAt('2026-06-10T22:59:00.000Z', '2026-06-10T23:00:00.000Z');
        expect(result.today).toEqual(none);
        expect(result.week).toEqual(one);
        // Completed at exactly local midnight belongs to the new day.
        result = await earnedAt('2026-06-10T23:00:00.000Z', '2026-06-10T23:00:00.000Z');
        expect(result.today).toEqual(one);
        // 00:30Z on the 10th is 01:30 local: already the 10th.
        result = await earnedAt('2026-06-10T00:30:00.000Z', '2026-06-10T12:00:00.000Z');
        expect(result.today).toEqual(one);
        // 22:30Z on the 9th is 23:30 local on the 9th: yesterday.
        result = await earnedAt('2026-06-09T22:30:00.000Z', '2026-06-10T12:00:00.000Z');
        expect(result.today).toEqual(none);
        expect(result.week).toEqual(one);
      });

      it('starts the week on Monday 00:00 in Tunis', async () => {
        // Mon 8 June 00:00 Tunis is Sun 7 June 23:00Z.
        let result = await earnedAt('2026-06-07T22:59:00.000Z', '2026-06-10T12:00:00.000Z');
        expect(result.week).toEqual(none);
        expect(result.month).toEqual(one);
        result = await earnedAt('2026-06-07T23:00:00.000Z', '2026-06-10T12:00:00.000Z');
        expect(result.week).toEqual(one);
        // On the Monday itself, Sunday evening is last week.
        result = await earnedAt('2026-06-07T22:59:00.000Z', '2026-06-08T10:00:00.000Z');
        expect(result.week).toEqual(none);
        // On Sunday the week still runs back to Monday; the next Monday turns it over.
        result = await earnedAt('2026-06-07T23:00:00.000Z', '2026-06-14T22:59:00.000Z');
        expect(result.week).toEqual(one);
        result = await earnedAt('2026-06-07T23:00:00.000Z', '2026-06-14T23:00:00.000Z');
        expect(result.week).toEqual(none);
      });

      it('starts the month on the 1st at 00:00 in Tunis', async () => {
        // 1 June 00:00 Tunis is 31 May 23:00Z.
        let result = await earnedAt('2026-05-31T22:59:00.000Z', '2026-06-10T12:00:00.000Z');
        expect(result.month).toEqual(none);
        result = await earnedAt('2026-05-31T23:00:00.000Z', '2026-06-10T12:00:00.000Z');
        expect(result.month).toEqual(one);
        // 30 June 23:00Z is already 1 July in Tunis.
        result = await earnedAt('2026-06-30T22:59:00.000Z', '2026-06-30T23:00:00.000Z');
        expect(result.month).toEqual(none);
        expect(result.week).toEqual(one);
        // And 31 Dec 23:00Z is 1 Jan 2027.
        result = await earnedAt('2026-12-31T22:59:00.000Z', '2026-12-31T23:00:00.000Z');
        expect(result.month).toEqual(none);
      });

      it('does not count trips completed after now', async () => {
        await setup();
        at('2026-06-10T10:00:00.000Z');
        await completeTrip();
        at('2026-06-10T09:00:00.000Z');
        expect((await earnings()).today).toEqual(none);
      });
    });
  });
});
