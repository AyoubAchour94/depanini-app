import {
  CUSTOMER_CANCEL_REASONS,
  DRIVER_CANCEL_REASONS,
  driverJobSchema,
  estimateRoadDistanceM,
  etaMinutes,
  offerSchema,
  PRESENCE_STALE_MS,
  suggestFare,
  towRequestSchema,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { towRequests, users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const laMarsa = { latitude: 36.878, longitude: 10.325 };
const ariana = { latitude: 36.8625, longitude: 10.1956 };

const STAGES = ['en_route', 'arrived', 'towing'] as const;
const STAMPS = { en_route: 'enRouteAt', arrived: 'arrivedAt', towing: 'towingAt' } as const;

describe('trip stages, completion and cancel rules (e2e)', () => {
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
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const goOnline = (token: string, location: { latitude: number; longitude: number } = laMarsa) =>
    api('put', '/driver/presence', token).send({ online: true, location }).expect(200);
  const suggested = suggestFare(estimateRoadDistanceM(tunis, sousse), 'car');
  const createRequest = () =>
    api('post', '/tow-requests', alice).send({
      pickup: tunis,
      dropoff: sousse,
      vehicleType: 'car',
      problemType: 'breakdown',
      proposedFare: suggested,
    });

  /** Alice's request, assigned to Dan (Eve is a second driver with no job). */
  const assign = async () => {
    await api('put', '/me/customer-profile', alice)
      .send({ fullName: 'Alice Customer', phone: '+21698111111' })
      .expect(200);
    for (const [token, name] of [
      [dan, 'Dan Driver'],
      [eve, 'Eve Driver'],
    ] as const) {
      await api('put', '/me/driver-profile', token)
        .send({
          fullName: name,
          phone: '+21698222222',
          truckType: 'flatbed',
          plateNumber: '1 TUN 2',
        })
        .expect(200);
    }
    await goOnline(dan);
    await goOnline(eve, ariana);
    const created = await createRequest().expect(201);
    const offer = offerSchema.parse(
      (
        await api('post', `/tow-requests/${created.body.id}/offers`, dan)
          .send({ fare: suggested })
          .expect(201)
      ).body,
    );
    await api('post', `/offers/${offer.id}/accept`, alice).expect(200);
    return towRequestSchema.parse(created.body);
  };
  const stage = (token: string, to: string) =>
    api('post', '/driver/job/stage', token).send({ stage: to });
  const advanceTo = async (target: (typeof STAGES)[number]) => {
    for (const next of STAGES) {
      await stage(dan, next).expect(200);
      secondsLater(10);
      if (next === target) return;
    }
  };
  const row = async (id: string) => {
    const [r] = await database.db.select().from(towRequests).where(eq(towRequests.id, id));
    return r!;
  };
  const active = async () =>
    towRequestSchema.parse((await api('get', '/tow-requests/active', alice).expect(200)).body);

  describe('accept', () => {
    it('starts the trip at accepted', async () => {
      const req = await assign();
      expect((await row(req.id)).tripStage).toBe('accepted');
      expect(await active()).toMatchObject({ status: 'assigned', tripStage: 'accepted' });
      const job = driverJobSchema.parse((await api('get', '/driver/job', dan).expect(200)).body);
      expect(job.tripStage).toBe('accepted');
    });
  });

  describe('POST /driver/job/stage', () => {
    it('needs a token and a driver profile', async () => {
      await api('post', '/driver/job/stage').send({ stage: 'en_route' }).expect(401);
      await assign();
      await api('put', '/me/customer-profile', 'token-zed')
        .send({ fullName: 'Zed', phone: '+21698333333' })
        .expect(200);
      await stage('token-zed', 'en_route').expect(403);
    });

    it('moves one step at a time and timestamps each step', async () => {
      const req = await assign();
      for (const next of STAGES) {
        secondsLater(30);
        const res = await stage(dan, next).expect(200);
        const job = driverJobSchema.parse(res.body);
        expect(job).toMatchObject({
          id: req.id,
          tripStage: next,
          [STAMPS[next]]: now.toISOString(),
        });
      }
      const r = await row(req.id);
      expect(r.enRouteAt).toBeInstanceOf(Date);
      expect(r.arrivedAt).toBeInstanceOf(Date);
      expect(r.towingAt).toBeInstanceOf(Date);
      expect(await active()).toMatchObject({ tripStage: 'towing' });
    });

    it('is 409 when skipping a step, repeating or going backwards', async () => {
      await assign();
      await stage(dan, 'arrived').expect(409);
      await stage(dan, 'towing').expect(409);
      await stage(dan, 'en_route').expect(200);
      await stage(dan, 'en_route').expect(409);
      await stage(dan, 'towing').expect(409);
      await stage(dan, 'arrived').expect(200);
      await stage(dan, 'en_route').expect(409);
    });

    it('is 400 for an unknown stage, including accepted', async () => {
      await assign();
      await stage(dan, 'accepted').expect(400);
      await stage(dan, 'flying').expect(400);
    });

    it('is 404 for a driver without a job', async () => {
      const req = await assign();
      await stage(eve, 'en_route').expect(404);
      expect((await row(req.id)).tripStage).toBe('accepted');
    });

    it('is 404 once the job is cancelled', async () => {
      const req = await assign();
      await api('post', `/tow-requests/${req.id}/cancel`, alice).expect(200);
      await stage(dan, 'en_route').expect(404);
    });
  });

  describe('POST /driver/job/complete', () => {
    it('needs a token', async () => {
      await api('post', '/driver/job/complete').expect(401);
    });

    it('is 409 before towing', async () => {
      const req = await assign();
      await api('post', '/driver/job/complete', dan).expect(409);
      await advanceTo('arrived');
      await api('post', '/driver/job/complete', dan).expect(409);
      expect((await row(req.id)).status).toBe('assigned');
    });

    it('is 404 for a driver without a job', async () => {
      await assign();
      await advanceTo('towing');
      await api('post', '/driver/job/complete', eve).expect(404);
    });

    it('completes the request from towing', async () => {
      const req = await assign();
      await advanceTo('towing');
      secondsLater(600);

      const res = await api('post', '/driver/job/complete', dan).expect(200);

      expect(towRequestSchema.parse(res.body)).toMatchObject({
        id: req.id,
        status: 'completed',
        completedAt: now.toISOString(),
        agreedFare: suggested,
      });
      expect((await row(req.id)).completedAt).toEqual(now);
      await api('get', '/driver/job', dan).expect(204);
      await api('post', '/driver/job/complete', dan).expect(404);
      await stage(dan, 'en_route').expect(404);
      const history = await api('get', '/tow-requests', alice).expect(200);
      expect(history.body.items[0]).toMatchObject({ status: 'completed' });
    });

    it('frees the driver and the customer', async () => {
      await assign();
      await advanceTo('towing');
      await api('post', '/driver/job/complete', dan).expect(200);
      const created = await createRequest().expect(201);
      await api('post', `/tow-requests/${created.body.id}/offers`, dan)
        .send({ fare: suggested })
        .expect(201);
    });
  });

  describe('GET /tow-requests/active after completion', () => {
    it('still returns the completed request for 10 minutes, then none', async () => {
      const req = await assign();
      await advanceTo('towing');
      await api('post', '/driver/job/complete', dan).expect(200);

      secondsLater(9 * 60);
      expect(await active()).toMatchObject({ id: req.id, status: 'completed' });
      secondsLater(2 * 60);
      await api('get', '/tow-requests/active', alice).expect(204);
    });

    it('prefers a newer open request to the completed one', async () => {
      await assign();
      await advanceTo('towing');
      await api('post', '/driver/job/complete', dan).expect(200);
      const created = await createRequest().expect(201);
      expect((await active()).id).toBe(created.body.id);
    });
  });

  describe('driverLocation and etaMin on the active request', () => {
    it('shows a fresh driver location and the ETA to the pickup', async () => {
      await assign();
      secondsLater(5);
      await goOnline(dan, laMarsa);

      const req = await active();

      expect(req.driverLocation).toMatchObject({ ...laMarsa, updatedAt: now.toISOString() });
      expect(req.etaMin).toBe(etaMinutes(estimateRoadDistanceM(laMarsa, tunis)));
    });

    it('has no ETA once arrived, and an ETA to the drop-off while towing', async () => {
      await assign();
      await advanceTo('arrived');
      expect((await active()).etaMin ?? null).toBeNull();
      await stage(dan, 'towing').expect(200);
      await goOnline(dan, tunis);
      expect((await active()).etaMin).toBe(etaMinutes(estimateRoadDistanceM(tunis, sousse)));
    });

    it('has neither when the location is stale', async () => {
      await assign();
      secondsLater(PRESENCE_STALE_MS / 1000 + 1);
      const req = await active();
      expect(req.driverLocation ?? null).toBeNull();
      expect(req.etaMin ?? null).toBeNull();
    });

    it('has neither once completed', async () => {
      await assign();
      await advanceTo('towing');
      await api('post', '/driver/job/complete', dan).expect(200);
      const req = await active();
      expect(req.driverLocation ?? null).toBeNull();
      expect(req.etaMin ?? null).toBeNull();
    });

    it('is not in the history', async () => {
      await assign();
      const res = await api('get', '/tow-requests', alice).expect(200);
      expect(res.body.items[0].driverLocation ?? null).toBeNull();
    });
  });

  describe('POST /tow-requests/:id/cancel by the customer', () => {
    const cancel = (id: string, body?: object) =>
      api('post', `/tow-requests/${id}/cancel`, alice).send(body ?? {});

    it('is free before the driver has arrived', async () => {
      for (const upTo of [undefined, 'en_route'] as const) {
        const req = await assign();
        if (upTo) await advanceTo(upTo);
        const res = await cancel(req.id).expect(200);
        expect(towRequestSchema.parse(res.body)).toMatchObject({
          status: 'cancelled',
          cancelledBy: 'customer',
        });
        expect((await row(req.id)).cancelReason).toBeNull();
        await database.db.delete(users);
      }
    });

    it('takes an optional reason from the customer list', async () => {
      const req = await assign();
      await cancel(req.id, { reason: 'unsafe' }).expect(400);
      const res = await cancel(req.id, { reason: 'driver_late' }).expect(200);
      expect(res.body).toMatchObject({ cancelledBy: 'customer', cancelReason: 'driver_late' });
    });

    it('needs a reason from the customer list once arrived', async () => {
      const req = await assign();
      await advanceTo('arrived');
      await cancel(req.id).expect(400);
      await cancel(req.id, { reason: 'bogus' }).expect(400);
      for (const reason of DRIVER_CANCEL_REASONS.filter((r) => r !== 'other')) {
        await cancel(req.id, { reason }).expect(400);
      }
      expect((await row(req.id)).status).toBe('assigned');
      const res = await cancel(req.id, { reason: CUSTOMER_CANCEL_REASONS[1] }).expect(200);
      expect(res.body).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'customer',
        cancelReason: 'problem_solved',
      });
    });

    it('is 409 once towing, with or without a reason', async () => {
      const req = await assign();
      await advanceTo('towing');
      await cancel(req.id).expect(409);
      await cancel(req.id, { reason: 'other' }).expect(409);
      expect((await row(req.id)).status).toBe('assigned');
    });

    it('is 409 for a completed request', async () => {
      const req = await assign();
      await advanceTo('towing');
      await api('post', '/driver/job/complete', dan).expect(200);
      await cancel(req.id).expect(409);
    });
  });

  describe('POST /tow-requests/:id/cancel by the driver', () => {
    const cancel = (id: string, body?: object, token = dan) =>
      api('post', `/tow-requests/${id}/cancel`, token).send(body ?? {});

    it('always needs a reason from the driver list', async () => {
      for (const upTo of [undefined, 'en_route', 'arrived'] as const) {
        const req = await assign();
        if (upTo) await advanceTo(upTo);
        await cancel(req.id).expect(400);
        await cancel(req.id, { reason: 'driver_late' }).expect(400);
        await cancel(req.id, { reason: 'bogus' }).expect(400);
        expect((await row(req.id)).status).toBe('assigned');

        const res = await cancel(req.id, { reason: 'truck_problem' }).expect(200);

        expect(towRequestSchema.parse(res.body)).toMatchObject({
          status: 'cancelled',
          cancelledBy: 'driver',
          cancelReason: 'truck_problem',
        });
        expect(await row(req.id)).toMatchObject({
          cancelledBy: 'driver',
          cancelReason: 'truck_problem',
        });
        await database.db.delete(users);
      }
    });

    it('is 409 once towing, with a reason', async () => {
      const req = await assign();
      await advanceTo('towing');
      await cancel(req.id, { reason: 'truck_problem' }).expect(409);
      expect((await row(req.id)).status).toBe('assigned');
    });

    it('is 404 for another driver', async () => {
      const req = await assign();
      await cancel(req.id, { reason: 'unsafe' }, eve).expect(404);
    });
  });

  describe('DELETE /me during a job', () => {
    it('records the driver as the canceller, without a reason', async () => {
      const req = await assign();
      await api('delete', '/me', dan).expect(204);
      expect(await row(req.id)).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'driver',
        cancelReason: null,
      });
    });
  });
});
