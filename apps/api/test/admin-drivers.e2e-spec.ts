import {
  adminDriverDetailSchema,
  adminDriverPageSchema,
  auditPageSchema,
  DOCUMENT_KINDS,
  type PushKind,
  pushDataSchema,
  verificationSchema,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { adminActions, driverProfiles, users } from '../src/db/schema.js';
import { NotificationsService } from '../src/push/notifications.service.js';
import { approveDriverByToken } from './support/approve-driver.js';
import { adminToken, createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';
import { connectAs } from './support/ws-client.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const unknownId = '00000000-0000-4000-8000-000000000000';
const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };

type Method = 'get' | 'post' | 'put' | 'delete';

const root = adminToken('root', 'root@depanini.test');
const dan = 'token-dan:dan@example.com';
const eve = 'token-eve:eve@example.com';
const alice = 'token-alice:alice@example.com';
/** Verified tokens whose claims do not make them admins. */
const notAdmins = {
  'no admin claim': 'token-mal:mal@example.com',
  'admin: false': `token-mal:mal@example.com|${JSON.stringify({ admin: false })}`,
  'admin: "true"': `token-mal:mal@example.com|${JSON.stringify({ admin: 'true' })}`,
  'admin: 1': `token-mal:mal@example.com|${JSON.stringify({ admin: 1 })}`,
};

/** Every admin route, with a body that would be valid. */
const ADMIN_ROUTES: [Method, string, object?][] = [
  ['get', '/admin/drivers'],
  ['get', `/admin/drivers/${unknownId}`],
  ['post', `/admin/drivers/${unknownId}/review`, { decision: 'approve' }],
  ['get', `/admin/files/${unknownId}`],
  ['get', '/admin/users'],
  ['get', `/admin/users/${unknownId}`],
  ['get', '/admin/trips'],
  ['get', `/admin/trips/${unknownId}`],
  ['get', '/admin/reports'],
  ['get', '/admin/disputes'],
  ['post', `/admin/reports/${unknownId}/resolve`, { note: 'Done' }],
  ['post', `/admin/disputes/${unknownId}/resolve`, { note: 'Done' }],
  ['get', '/admin/audit'],
];

describe('admin: guard, driver review, files and audit log (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;
  let now = new Date('2026-06-01T10:00:00.000Z');

  beforeAll(async () => {
    app = await createTestApp(database.db, { now: () => now, env: { PUSH_INBOX: true } });
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    now = new Date('2026-06-01T10:00:00.000Z');
    await database.db.delete(users);
    await database.db.delete(adminActions);
    await app.get(NotificationsService).flush();
    await api('delete', '/dev/push-inbox').expect(204);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const api = (method: Method, path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const userId = async (token: string) => (await api('get', '/me', token).expect(200)).body.id;
  const makeDriver = (token: string, fullName = 'Dan Driver') =>
    api('put', '/me/driver-profile', token)
      .send({ fullName, phone: '+21698222222', truckType: 'flatbed', plateNumber: '123 TU 4567' })
      .expect(200);
  const upload = async (token: string, kind: string, bytes = PNG, contentType = 'image/png') =>
    (
      await api('post', '/driver/documents', token)
        .field('kind', kind)
        .attach('file', bytes, { filename: 'scan', contentType })
        .expect(201)
    ).body as { id: string };
  /** A driver with every document uploaded and submitted: `pending`. Returns the user id. */
  const pendingDriver = async (token: string, fullName?: string) => {
    await makeDriver(token, fullName);
    for (const kind of DOCUMENT_KINDS) await upload(token, kind);
    await api('post', '/driver/verification/submit', token).expect(200);
    return userId(token);
  };
  const review = (id: string, body: object, token = root) =>
    api('post', `/admin/drivers/${id}/review`, token).send(body);
  const pushKinds = async (token: string): Promise<PushKind[]> => {
    await app.get(NotificationsService).flush();
    const res = await api('get', `/dev/push-inbox?userId=${await userId(token)}`).expect(200);
    return (res.body as { data: unknown }[]).map((push) => pushDataSchema.parse(push.data).kind);
  };
  const audit = async () =>
    auditPageSchema.parse((await api('get', '/admin/audit', root).expect(200)).body);

  describe('AdminGuard', () => {
    it.each(ADMIN_ROUTES)('%s %s needs a token (401)', async (method, path, body) => {
      await api(method, path).send(body).expect(401);
      await api(method, path, 'forged').send(body).expect(401);
    });

    it.each(Object.entries(notAdmins))(
      'refuses a verified token with %s on every route (403)',
      async (_name, token) => {
        for (const [method, path, body] of ADMIN_ROUTES) {
          const res = await api(method, path, token).send(body);
          expect([method, path, res.status]).toEqual([method, path, 403]);
        }
      },
    );

    it('lets an admin through on every route', async () => {
      for (const [method, path, body] of ADMIN_ROUTES) {
        const res = await api(method, path, root).send(body);
        expect([401, 403]).not.toContain(res.status);
      }
    });

    it('does not make admins of drivers, even approved ones', async () => {
      await makeDriver(dan);
      await approveDriverByToken(database.db, dan);
      await api('get', '/admin/drivers', dan).expect(403);
    });
  });

  describe('GET /admin/drivers', () => {
    it('lists drivers with their status, and filters by it', async () => {
      const danId = await pendingDriver(dan);
      await makeDriver(eve, 'Eve Driver');
      await api('put', '/me/customer-profile', alice)
        .send({ fullName: 'Alice', phone: '+21698111111' })
        .expect(200);

      const all = adminDriverPageSchema.parse(
        (await api('get', '/admin/drivers', root).expect(200)).body,
      );
      expect(all.items.map((d) => d.fullName).sort()).toEqual(['Dan Driver', 'Eve Driver']);
      expect(all.nextCursor).toBeNull();

      const pending = adminDriverPageSchema.parse(
        (await api('get', '/admin/drivers?status=pending', root).expect(200)).body,
      );
      expect(pending.items).toEqual([
        {
          userId: danId,
          fullName: 'Dan Driver',
          email: 'dan@example.com',
          phone: '+21698222222',
          truckType: 'flatbed',
          plateNumber: '123 TU 4567',
          verificationStatus: 'pending',
          submittedAt: now.toISOString(),
        },
      ]);
      const unsubmitted = (await api('get', '/admin/drivers?status=unsubmitted', root).expect(200))
        .body;
      expect(unsubmitted.items.map((d: { fullName: string }) => d.fullName)).toEqual([
        'Eve Driver',
      ]);
    });

    it('serves the pending queue oldest submission first, page by page', async () => {
      const tokens = [
        'token-d1:d1@example.com',
        'token-d2:d2@example.com',
        'token-d3:d3@example.com',
      ];
      for (const [i, token] of tokens.entries()) {
        now = new Date(Date.UTC(2026, 5, 1, 10, 0, 3 - i));
        await pendingDriver(token, `Driver ${i + 1}`);
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `&cursor=${cursor}` : '';
        const page = adminDriverPageSchema.parse(
          (await api('get', `/admin/drivers?status=pending&limit=2${query}`, root).expect(200))
            .body,
        );
        seen.push(...page.items.map((d) => d.fullName));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toEqual(['Driver 3', 'Driver 2', 'Driver 1']);
    });

    it('rejects a bad status, cursor or limit', async () => {
      await api('get', '/admin/drivers?status=online', root).expect(400);
      await api('get', '/admin/drivers?cursor=nope', root).expect(400);
      await api('get', '/admin/drivers?limit=0', root).expect(400);
      await api('get', '/admin/drivers?limit=51', root).expect(400);
    });
  });

  describe('GET /admin/drivers/:userId', () => {
    it('returns the profile, the check and the documents', async () => {
      const danId = await pendingDriver(dan);
      const detail = adminDriverDetailSchema.parse(
        (await api('get', `/admin/drivers/${danId}`, root).expect(200)).body,
      );
      expect(detail).toMatchObject({
        userId: danId,
        fullName: 'Dan Driver',
        verificationStatus: 'pending',
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
      });
      expect(detail.documents.map((d) => d.kind).sort()).toEqual([...DOCUMENT_KINDS].sort());
    });

    it('is 404 for an unknown or malformed id, or an account without a driver profile', async () => {
      await api('put', '/me/customer-profile', alice)
        .send({ fullName: 'Alice', phone: '+21698111111' })
        .expect(200);
      await api('get', `/admin/drivers/${unknownId}`, root).expect(404);
      await api('get', '/admin/drivers/nope', root).expect(404);
      await api('get', `/admin/drivers/${await userId(alice)}`, root).expect(404);
    });
  });

  describe('POST /admin/drivers/:userId/review', () => {
    it('approves a pending driver, who can then go online, and tells them by push', async () => {
      const danId = await pendingDriver(dan);
      await api('put', '/me/devices', dan)
        .send({ token: 'dan-phone', platform: 'android', appVariant: 'driver' })
        .expect(204);
      await api('put', '/driver/presence', dan).send({ online: true, location: tunis }).expect(403);
      now = new Date('2026-06-01T11:00:00.000Z');

      const res = await review(danId, { decision: 'approve' }).expect(200);
      const detail = adminDriverDetailSchema.parse(res.body);
      const rootId = await userId(root);
      expect(detail).toMatchObject({
        verificationStatus: 'approved',
        rejectionReason: null,
        reviewedAt: now.toISOString(),
        reviewedBy: rootId,
      });
      await api('put', '/driver/presence', dan).send({ online: true, location: tunis }).expect(200);
      expect(await pushKinds(dan)).toEqual(['verification_approved']);

      const { items } = await audit();
      expect(items).toEqual([
        {
          id: expect.any(String),
          adminUserId: rootId,
          adminEmail: 'root@depanini.test',
          action: 'driver_approved',
          targetType: 'driver',
          targetId: danId,
          details: { decision: 'approve' },
          createdAt: expect.any(String),
        },
      ]);
    });

    it('pushes even while the driver has the app open', async () => {
      const danId = await pendingDriver(dan);
      await api('put', '/me/devices', dan)
        .send({ token: 'dan-phone', platform: 'android', appVariant: 'driver' })
        .expect(204);
      const socket = await connectAs(app, dan);
      try {
        await review(danId, { decision: 'approve' }).expect(200);
        expect(await pushKinds(dan)).toEqual(['verification_approved']);
      } finally {
        socket.close();
      }
    });

    it('rejects with a reason the driver sees, who can then fix and resubmit', async () => {
      const danId = await pendingDriver(dan);
      await api('put', '/me/devices', dan)
        .send({ token: 'dan-phone', platform: 'android', appVariant: 'driver' })
        .expect(204);

      const res = await review(danId, { decision: 'reject', reason: '  Licence is blurry ' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        verificationStatus: 'rejected',
        rejectionReason: 'Licence is blurry',
      });
      const mine = verificationSchema.parse(
        (await api('get', '/driver/verification', dan).expect(200)).body,
      );
      expect(mine).toMatchObject({ status: 'rejected', rejectionReason: 'Licence is blurry' });
      expect(await pushKinds(dan)).toEqual(['verification_rejected']);
      await api('put', '/driver/presence', dan).send({ online: true, location: tunis }).expect(403);

      // The driver fixes a page and resubmits; the review starts over.
      await upload(dan, 'licence', PDF, 'application/pdf');
      await api('post', '/driver/verification/submit', dan).expect(200);
      now = new Date('2026-06-01T12:00:00.000Z');
      await review(danId, { decision: 'approve' }).expect(200);

      const { items } = await audit();
      expect(items.map((entry) => [entry.action, entry.details])).toEqual([
        ['driver_approved', { decision: 'approve' }],
        ['driver_rejected', { decision: 'reject', reason: 'Licence is blurry' }],
      ]);
    });

    it.each([
      ['no decision', {}],
      ['an unknown decision', { decision: 'maybe' }],
      ['a rejection without a reason', { decision: 'reject' }],
      ['a rejection with a blank reason', { decision: 'reject', reason: '   ' }],
      [
        'a rejection with a reason that is too long',
        { decision: 'reject', reason: 'x'.repeat(501) },
      ],
    ])('rejects %s with 400', async (_name, body) => {
      const danId = await pendingDriver(dan);
      await review(danId, body).expect(400);
      const [profile] = await database.db
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, danId));
      expect(profile!.verificationStatus).toBe('pending');
    });

    it('is only allowed from pending: 409, no audit row and no push otherwise', async () => {
      await makeDriver(dan);
      await api('put', '/me/devices', dan)
        .send({ token: 'dan-phone', platform: 'android', appVariant: 'driver' })
        .expect(204);
      const danId = await userId(dan);
      await review(danId, { decision: 'approve' }).expect(409); // unsubmitted

      for (const kind of DOCUMENT_KINDS) await upload(dan, kind);
      await api('post', '/driver/verification/submit', dan).expect(200);
      await review(danId, { decision: 'approve' }).expect(200);
      await review(danId, { decision: 'approve' }).expect(409); // approved
      await review(danId, { decision: 'reject', reason: 'Too late' }).expect(409);

      expect((await audit()).items).toHaveLength(1);
      expect(await pushKinds(dan)).toEqual(['verification_approved']);
    });

    it('lets only one of two concurrent reviews win', async () => {
      const danId = await pendingDriver(dan);
      const results = await Promise.all([
        review(danId, { decision: 'approve' }),
        review(danId, { decision: 'reject', reason: 'No' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await audit()).items).toHaveLength(1);
    });

    it('is 404 for an unknown or malformed driver', async () => {
      await review(unknownId, { decision: 'approve' }).expect(404);
      await review('nope', { decision: 'approve' }).expect(404);
    });
  });

  describe('GET /admin/files/:id', () => {
    it('streams any driver’s page with the owner route’s headers', async () => {
      await makeDriver(dan);
      const page = await upload(dan, 'licence');
      const res = await api('get', `/admin/files/${page.id}`, root).expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(res.body as Buffer).equals(PNG)).toBe(true);
      // The owner still gets their own file; another driver never does.
      await api('get', `/files/${page.id}`, dan).expect(200);
      await makeDriver(eve);
      await api('get', `/files/${page.id}`, eve).expect(404);
      await api('get', `/admin/files/${page.id}`, eve).expect(403);
    });

    it('is 404 for an unknown or malformed id', async () => {
      await api('get', `/admin/files/${unknownId}`, root).expect(404);
      await api('get', '/admin/files/nope', root).expect(404);
    });
  });

  describe('GET /admin/audit', () => {
    it('lists the actions newest first, page by page, and outlives the admin’s account', async () => {
      const tokens = [
        'token-d1:d1@example.com',
        'token-d2:d2@example.com',
        'token-d3:d3@example.com',
      ];
      const ids: string[] = [];
      for (const token of tokens) ids.push(await pendingDriver(token));
      for (const [i, id] of ids.entries()) {
        now = new Date(Date.UTC(2026, 5, 1, 12, 0, i));
        await review(id, { decision: 'approve' }).expect(200);
      }
      const rootId = await userId(root);
      await api('delete', '/me', root).expect(204);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `&cursor=${cursor}` : '';
        const page = auditPageSchema.parse(
          (await api('get', `/admin/audit?limit=2${query}`, adminToken('other')).expect(200)).body,
        );
        for (const entry of page.items) {
          expect(entry).toMatchObject({ adminUserId: rootId, adminEmail: 'root@depanini.test' });
        }
        seen.push(...page.items.map((entry) => entry.targetId));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toEqual([...ids].reverse());
    });
  });
});
