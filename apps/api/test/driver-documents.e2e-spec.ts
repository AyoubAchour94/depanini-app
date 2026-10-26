import {
  DOCUMENT_KINDS,
  DRIVER_NOT_APPROVED,
  type DocumentKind,
  driverDocumentSchema,
  estimateRoadDistanceM,
  suggestFare,
  UPLOAD_LIMIT_REACHED,
  UPLOAD_MAX_BYTES,
  verificationSchema,
} from '@depanini/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import {
  documentUploads,
  driverDocuments,
  driverProfiles,
  files,
  users,
} from '../src/db/schema.js';
import { driversNearRequests } from '../src/realtime/nearby-drivers.js';
import { MAX_PAGES_PER_KIND } from '../src/verification/verification.service.js';
import { approveDriver, approveDriverByToken } from './support/approve-driver.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

const tunis = { latitude: 36.8065, longitude: 10.1815, address: 'Tunis' };
const sousse = { latitude: 35.8256, longitude: 10.6084, address: 'Sousse' };
const unknownId = '00000000-0000-4000-8000-000000000000';

describe('driver documents, verification and the online gate (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp(database.db);
    // Listening up front: on a server that is not, supertest starts it on the first call and
    // every concurrent call waits with its own listeners (a MaxListeners warning past 10).
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    await database.db.delete(users);
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const dan = 'token-dan:dan@example.com';
  const eve = 'token-eve:eve@example.com';
  const alice = 'token-alice:alice@example.com';

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string) => {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const makeDriver = (token: string) =>
    api('put', '/me/driver-profile', token)
      .send({
        fullName: 'Dan Driver',
        phone: '+21698222222',
        truckType: 'flatbed',
        plateNumber: '123 TUN 4567',
      })
      .expect(200);
  const makeCustomer = (token: string) =>
    api('put', '/me/customer-profile', token)
      .send({ fullName: 'Alice', phone: '+21698111111' })
      .expect(200);

  /** POST /driver/documents with `bytes` as the file. */
  const upload = (
    token: string | undefined,
    kind: string | undefined,
    bytes: Buffer,
    { filename = 'scan.bin', contentType }: { filename?: string; contentType?: string } = {},
  ) => {
    const req = api('post', '/driver/documents', token);
    if (kind !== undefined) req.field('kind', kind);
    return req.attach('file', bytes, { filename, contentType });
  };
  const uploadOk = async (
    token: string,
    kind: DocumentKind,
    bytes = PNG,
    contentType = 'image/png',
  ) =>
    driverDocumentSchema.parse(
      (await upload(token, kind, bytes, { contentType }).expect(201)).body,
    );
  const verification = async (token: string) =>
    verificationSchema.parse((await api('get', '/driver/verification', token).expect(200)).body);
  const uploadAll = async (token: string) => {
    for (const kind of DOCUMENT_KINDS) await uploadOk(token, kind);
  };
  const userId = async (firebaseUid: string) =>
    (await database.db.select().from(users).where(eq(users.firebaseUid, firebaseUid)))[0]!.id;

  describe('POST /driver/documents', () => {
    it('rejects a request without a token', async () => {
      await upload(undefined, 'licence', PNG).expect(401);
    });

    it('needs a driver profile', async () => {
      await upload(alice, 'licence', PNG).expect(403);
      await makeCustomer(alice);
      await upload(alice, 'licence', PNG).expect(403);
      expect(await database.db.select().from(files)).toHaveLength(0);
    });

    it.each([
      ['a PNG', PNG, 'image/png'],
      ['a JPEG', JPEG, 'image/jpeg'],
      ['a PDF', PDF, 'application/pdf'],
    ])('stores %s and numbers the pages of a kind', async (_name, bytes, contentType) => {
      await makeDriver(dan);
      const first = await uploadOk(dan, 'licence', bytes, contentType);
      const second = await uploadOk(dan, 'licence', bytes, contentType);
      const other = await uploadOk(dan, 'insurance', bytes, contentType);

      expect(first).toMatchObject({
        kind: 'licence',
        page: 1,
        contentType,
        sizeBytes: bytes.length,
      });
      expect(second.page).toBe(2);
      expect(other).toMatchObject({ kind: 'insurance', page: 1 });
      const stored = await database.db.select().from(files);
      expect(stored).toHaveLength(3);
      expect(stored[0]).toMatchObject({ contentType, sizeBytes: bytes.length });
      expect(stored[0]!.data.equals(bytes)).toBe(true);
      expect(stored[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('takes the type from the bytes, not from the client, and ignores the filename', async () => {
      await makeDriver(dan);
      const document = await uploadOk(dan, 'licence', PDF, 'application/pdf');
      expect(document.contentType).toBe('application/pdf');
      const res = await upload(dan, 'licence', PNG, {
        filename: '../../etc/passwd.pdf',
        contentType: 'image/png',
      }).expect(201);
      expect(JSON.stringify(res.body)).not.toContain('passwd');
    });

    it.each([
      ['text sent as a PNG', Buffer.from('hello, not an image'), 'image/png'],
      ['a PNG sent as a PDF', PNG, 'application/pdf'],
      ['a GIF', Buffer.from('GIF89a....'), 'image/gif'],
      ['an empty file', Buffer.alloc(0), 'image/png'],
    ])('rejects %s with 415', async (_name, bytes, contentType) => {
      await makeDriver(dan);
      await upload(dan, 'licence', bytes, { contentType }).expect(415);
      expect(await database.db.select().from(files)).toHaveLength(0);
    });

    it('rejects a file over the limit with 413 and stores nothing', async () => {
      await makeDriver(dan);
      const big = Buffer.concat([PNG, Buffer.alloc(UPLOAD_MAX_BYTES)]);
      await upload(dan, 'licence', big, { contentType: 'image/png' }).expect(413);
      expect(await database.db.select().from(files)).toHaveLength(0);
    });

    it('takes a file of exactly the limit', async () => {
      await makeDriver(dan);
      const exact = Buffer.concat([PNG, Buffer.alloc(UPLOAD_MAX_BYTES - PNG.length)]);
      const document = await uploadOk(dan, 'licence', exact);
      expect(document.sizeBytes).toBe(UPLOAD_MAX_BYTES);
    });

    it.each([
      ['no kind', undefined],
      ['an unknown kind', 'passport'],
    ])('rejects %s with 400', async (_name, kind) => {
      await makeDriver(dan);
      await upload(dan, kind, PNG, { contentType: 'image/png' }).expect(400);
    });

    it('rejects a request without a file, with two files, or that is not multipart', async () => {
      await makeDriver(dan);
      await api('post', '/driver/documents', dan).field('kind', 'licence').expect(400);
      await api('post', '/driver/documents', dan)
        .field('kind', 'licence')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' })
        .expect(400);
      await api('post', '/driver/documents', dan).send({ kind: 'licence' }).expect(400);
      expect(await database.db.select().from(files)).toHaveLength(0);
    });

    it('allows at most a few pages per kind', async () => {
      await makeDriver(dan);
      for (let page = 1; page <= MAX_PAGES_PER_KIND; page += 1) await uploadOk(dan, 'licence');
      await upload(dan, 'licence', PNG, { contentType: 'image/png' }).expect(409);
      await uploadOk(dan, 'insurance');
    });

    it('is refused while the documents are pending or approved', async () => {
      await makeDriver(dan);
      await uploadAll(dan);
      await api('post', '/driver/verification/submit', dan).expect(200);
      await upload(dan, 'licence', PNG, { contentType: 'image/png' }).expect(409);
      await approveDriverByToken(database.db, dan);
      await upload(dan, 'licence', PNG, { contentType: 'image/png' }).expect(409);
      expect(await database.db.select().from(files)).toHaveLength(DOCUMENT_KINDS.length);
    });
  });

  describe('the per-driver upload limit', () => {
    /** Uploads the driver made `hoursAgo`, written straight to the log. */
    const uploadedEarlier = async (token: string, count: number, hoursAgo: number) => {
      const driverUserId = await userId(/^token-([^:]+)/.exec(token)![1]!);
      const createdAt = new Date(Date.now() - hoursAgo * 3_600_000);
      await database.db
        .insert(documentUploads)
        .values(Array.from({ length: count }, () => ({ driverUserId, createdAt })));
    };
    const expectLimited = async (token: string) => {
      const res = await upload(token, 'insurance', PNG, { contentType: 'image/png' }).expect(429);
      expect(res.body).toMatchObject({ code: UPLOAD_LIMIT_REACHED });
    };

    it('refuses the 21st upload within an hour with 429, for that driver only', async () => {
      await makeDriver(dan);
      await makeDriver(eve);
      for (let page = 1; page <= 10; page += 1) await uploadOk(dan, 'licence');
      for (let page = 1; page <= 10; page += 1) await uploadOk(dan, 'registration');

      await expectLimited(dan);
      expect(await database.db.select().from(files)).toHaveLength(20);
      await uploadOk(eve, 'insurance');
    });

    it('does not give a slot back when a page is deleted', async () => {
      await makeDriver(dan);
      await uploadedEarlier(dan, 19, 0.5);
      const page = await uploadOk(dan, 'insurance');
      await api('delete', `/driver/documents/${page.id}`, dan).expect(204);
      expect(await database.db.select().from(files)).toHaveLength(0);
      await expectLimited(dan);
    });

    it('lets only one of several parallel uploads take the last slot', async () => {
      await makeDriver(dan);
      await uploadedEarlier(dan, 19, 0.5);
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          upload(dan, 'insurance', PNG, { contentType: 'image/png' }),
        ),
      );
      expect(results.map((res) => res.status).sort()).toEqual([201, 429, 429, 429, 429]);
      expect(await database.db.select().from(files)).toHaveLength(1);
      expect(await database.db.select().from(documentUploads)).toHaveLength(20);
    });

    it('counts only the last hour against the hourly limit', async () => {
      await makeDriver(dan);
      await uploadedEarlier(dan, 30, 2);
      await uploadOk(dan, 'insurance');
    });

    it('refuses the 61st upload within a day', async () => {
      await makeDriver(dan);
      await uploadedEarlier(dan, 59, 2);
      await uploadOk(dan, 'insurance');
      await expectLimited(dan);
    });

    it('forgets uploads older than a day', async () => {
      await makeDriver(dan);
      await uploadedEarlier(dan, 100, 25);
      await uploadOk(dan, 'insurance');
    });
  });

  describe('GET /driver/verification', () => {
    it('needs a token and a driver profile', async () => {
      await api('get', '/driver/verification').expect(401);
      await api('get', '/driver/verification', dan).expect(403);
    });

    it('starts unsubmitted with every kind missing', async () => {
      await makeDriver(dan);
      expect(await verification(dan)).toEqual({
        status: 'unsubmitted',
        rejectionReason: null,
        submittedAt: null,
        reviewedAt: null,
        documents: [],
        missingKinds: [...DOCUMENT_KINDS],
      });
    });

    it('lists the pages and what is still missing', async () => {
      await makeDriver(dan);
      await uploadOk(dan, 'licence');
      await uploadOk(dan, 'licence', JPEG, 'image/jpeg');
      await uploadOk(dan, 'national_id');
      const result = await verification(dan);
      expect(result.documents.map((d) => [d.kind, d.page])).toEqual([
        ['licence', 1],
        ['licence', 2],
        ['national_id', 1],
      ]);
      expect(result.missingKinds).toEqual(['registration', 'insurance']);
    });

    it('shows only the driver’s own documents', async () => {
      await makeDriver(dan);
      await makeDriver(eve);
      await uploadOk(dan, 'licence');
      expect((await verification(eve)).documents).toEqual([]);
    });

    it('shows the status and rejection reason', async () => {
      await makeDriver(dan);
      const id = await userId('dan');
      await database.db
        .update(driverProfiles)
        .set({ verificationStatus: 'rejected', rejectionReason: 'Blurry', reviewedAt: new Date() })
        .where(eq(driverProfiles.userId, id));
      const result = await verification(dan);
      expect(result).toMatchObject({ status: 'rejected', rejectionReason: 'Blurry' });
      expect(result.reviewedAt).toEqual(expect.any(String));
    });
  });

  describe('DELETE /driver/documents/:id', () => {
    it('needs a token and a driver profile', async () => {
      await api('delete', `/driver/documents/${unknownId}`).expect(401);
      await api('delete', `/driver/documents/${unknownId}`, dan).expect(403);
    });

    it('deletes a page and its file', async () => {
      await makeDriver(dan);
      const document = await uploadOk(dan, 'licence');
      await api('delete', `/driver/documents/${document.id}`, dan).expect(204);
      expect(await database.db.select().from(driverDocuments)).toHaveLength(0);
      expect(await database.db.select().from(files)).toHaveLength(0);
      expect((await verification(dan)).missingKinds).toContain('licence');
    });

    it('numbers a new page after the highest one', async () => {
      await makeDriver(dan);
      await uploadOk(dan, 'licence');
      const second = await uploadOk(dan, 'licence');
      await api('delete', `/driver/documents/${second.id}`, dan).expect(204);
      expect((await uploadOk(dan, 'licence')).page).toBe(2);
    });

    it('is 404 for an unknown, malformed or someone else’s document', async () => {
      await makeDriver(dan);
      await makeDriver(eve);
      const document = await uploadOk(dan, 'licence');
      await api('delete', `/driver/documents/${unknownId}`, dan).expect(404);
      await api('delete', '/driver/documents/nope', dan).expect(404);
      await api('delete', `/driver/documents/${document.id}`, eve).expect(404);
      expect(await database.db.select().from(driverDocuments)).toHaveLength(1);
    });

    it('is refused while pending or approved, and allowed again once rejected', async () => {
      await makeDriver(dan);
      await uploadAll(dan);
      const { documents } = await verification(dan);
      await api('post', '/driver/verification/submit', dan).expect(200);
      await api('delete', `/driver/documents/${documents[0]!.id}`, dan).expect(409);
      await approveDriverByToken(database.db, dan);
      await api('delete', `/driver/documents/${documents[0]!.id}`, dan).expect(409);
      await database.db
        .update(driverProfiles)
        .set({ verificationStatus: 'rejected', rejectionReason: 'Blurry' })
        .where(eq(driverProfiles.userId, await userId('dan')));
      await api('delete', `/driver/documents/${documents[0]!.id}`, dan).expect(204);
    });
  });

  describe('POST /driver/verification/submit', () => {
    it('needs a token and a driver profile', async () => {
      await api('post', '/driver/verification/submit').expect(401);
      await api('post', '/driver/verification/submit', dan).expect(403);
    });

    it('is refused until every kind has a page', async () => {
      await makeDriver(dan);
      await api('post', '/driver/verification/submit', dan).expect(409);
      await uploadOk(dan, 'licence');
      await uploadOk(dan, 'registration');
      await uploadOk(dan, 'insurance');
      const res = await api('post', '/driver/verification/submit', dan).expect(409);
      expect(res.body.message).toContain('national_id');
      expect((await verification(dan)).status).toBe('unsubmitted');
    });

    it('moves to pending and stamps the time', async () => {
      await makeDriver(dan);
      await uploadAll(dan);
      const res = await api('post', '/driver/verification/submit', dan).expect(200);
      const result = verificationSchema.parse(res.body);
      expect(result).toMatchObject({ status: 'pending', missingKinds: [] });
      expect(result.submittedAt).toEqual(expect.any(String));
      expect(result.documents).toHaveLength(DOCUMENT_KINDS.length);
    });

    it('cannot be repeated while pending or approved', async () => {
      await makeDriver(dan);
      await uploadAll(dan);
      await api('post', '/driver/verification/submit', dan).expect(200);
      await api('post', '/driver/verification/submit', dan).expect(409);
      await approveDriverByToken(database.db, dan);
      await api('post', '/driver/verification/submit', dan).expect(409);
    });

    it('resubmits after a rejection and clears the reason', async () => {
      await makeDriver(dan);
      await uploadAll(dan);
      await api('post', '/driver/verification/submit', dan).expect(200);
      await database.db
        .update(driverProfiles)
        .set({ verificationStatus: 'rejected', rejectionReason: 'Blurry' })
        .where(eq(driverProfiles.userId, await userId('dan')));
      await uploadOk(dan, 'licence');
      const result = verificationSchema.parse(
        (await api('post', '/driver/verification/submit', dan).expect(200)).body,
      );
      expect(result).toMatchObject({ status: 'pending', rejectionReason: null });
    });

    it('stays approved when the profile is edited', async () => {
      await makeDriver(dan);
      await approveDriverByToken(database.db, dan);
      await makeDriver(dan);
      const me = await api('get', '/me', dan).expect(200);
      expect(me.body.driverProfile.verificationStatus).toBe('approved');
    });
  });

  describe('the verification gate', () => {
    const forbidden = {
      statusCode: 403,
      code: DRIVER_NOT_APPROVED,
      message: expect.any(String),
    };

    /** An open request in Tunis by a customer, for the offer check. */
    const createRequest = async () => {
      await makeCustomer(alice);
      const res = await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggestFare(estimateRoadDistanceM(tunis, sousse), 'car'),
        })
        .expect(201);
      return res.body as { id: string; suggestedFare: number };
    };

    it.each(['unsubmitted', 'pending', 'rejected'] as const)(
      'refuses going online while %s',
      async (status) => {
        await makeDriver(dan);
        await database.db
          .update(driverProfiles)
          .set({ verificationStatus: status })
          .where(eq(driverProfiles.userId, await userId('dan')));
        const res = await api('put', '/driver/presence', dan)
          .send({ online: true, location: tunis })
          .expect(403);
        expect(res.body).toEqual(forbidden);
        expect(res.body.code).toBe(DRIVER_NOT_APPROVED);
      },
    );

    it('lets an approved driver go online and refuses nothing after', async () => {
      await makeDriver(dan);
      await approveDriver(database.db, await userId('dan'));
      await api('put', '/driver/presence', dan).send({ online: true, location: tunis }).expect(200);
      await api('get', '/driver/requests/nearby', dan).expect(200);
    });

    it('always lets a driver go offline', async () => {
      await makeDriver(dan);
      await api('put', '/driver/presence', dan).send({ online: false }).expect(200);
    });

    it('refuses the nearby list', async () => {
      await makeDriver(dan);
      const res = await api('get', '/driver/requests/nearby', dan).expect(403);
      expect(res.body).toEqual(forbidden);
    });

    it('refuses an offer', async () => {
      await makeDriver(dan);
      const created = await createRequest();
      const res = await api('post', `/tow-requests/${created.id}/offers`, dan)
        .send({ fare: created.suggestedFare })
        .expect(403);
      expect(res.body).toEqual(forbidden);
    });

    it('still lets an unapproved driver edit the profile and read the history', async () => {
      await makeDriver(dan);
      await api('get', '/driver/jobs', dan).expect(200);
      await api('get', '/driver/earnings', dan).expect(200);
      await api('get', '/driver/job', dan).expect(204);
    });
  });

  describe('GET /files/:id', () => {
    it('streams the bytes to the owner with safe headers', async () => {
      await makeDriver(dan);
      await uploadOk(dan, 'licence', PDF, 'application/pdf');
      const [file] = await database.db.select().from(files);
      // The id the API lists for a page also serves its file.
      expect((await verification(dan)).documents[0]!.id).toBe(file!.id);

      const res = await api('get', `/files/${file!.id}`, dan)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect((res.body as Buffer).equals(PDF)).toBe(true);
    });

    it('needs a token', async () => {
      await api('get', `/files/${unknownId}`).expect(401);
    });

    it('is 404 for a stranger, an unknown id and a malformed id', async () => {
      await makeDriver(dan);
      await uploadOk(dan, 'licence');
      const [file] = await database.db.select().from(files);
      await api('get', `/files/${file!.id}`, eve).expect(404);
      await api('get', `/files/${unknownId}`, dan).expect(404);
      await api('get', '/files/nope', dan).expect(404);
    });
  });

  describe('concurrent uploads', () => {
    it('finish, respect the page cap and keep the API alive with more uploads than pool connections', async () => {
      await makeDriver(dan);
      const uploads = Array.from({ length: 25 }, () =>
        upload(dan, 'licence', PNG, { contentType: 'image/png' }),
      );
      let polling = true;
      const healthStatuses: number[] = [];
      const poll = (async () => {
        while (polling) {
          healthStatuses.push((await api('get', '/health')).status);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      })();

      const statuses = (await Promise.all(uploads)).map((res) => res.status);
      polling = false;
      await poll;

      expect(statuses.filter((status) => status === 201)).toHaveLength(MAX_PAGES_PER_KIND);
      expect(statuses.filter((status) => status === 409)).toHaveLength(25 - MAX_PAGES_PER_KIND);
      expect(healthStatuses.length).toBeGreaterThan(0);
      expect(healthStatuses.every((status) => status === 200)).toBe(true);
      expect(await database.db.select().from(files)).toHaveLength(MAX_PAGES_PER_KIND);
      expect((await verification(dan)).documents.map((d) => d.page)).toEqual(
        Array.from({ length: MAX_PAGES_PER_KIND }, (_, i) => i + 1),
      );
    });
  });

  describe('nearby fan-out', () => {
    it('only targets approved drivers', async () => {
      await makeDriver(dan);
      await makeDriver(eve);
      await makeCustomer(alice);
      for (const token of [dan, eve]) {
        await approveDriverByToken(database.db, token);
        await api('put', '/driver/presence', token)
          .send({ online: true, location: tunis })
          .expect(200);
      }
      const created = await api('post', '/tow-requests', alice)
        .send({
          pickup: tunis,
          dropoff: sousse,
          vehicleType: 'car',
          problemType: 'breakdown',
          proposedFare: suggestFare(estimateRoadDistanceM(tunis, sousse), 'car'),
        })
        .expect(201);
      // Eve loses her approval while still marked online.
      await database.db
        .update(driverProfiles)
        .set({ verificationStatus: 'rejected' })
        .where(eq(driverProfiles.userId, await userId('eve')));

      const near = await driversNearRequests(database.db, new Date(), [created.body.id]);
      expect(near).toEqual([{ userId: await userId('dan'), requestId: created.body.id }]);
    });
  });

  describe('deleting the account', () => {
    it('removes its documents and files', async () => {
      await makeDriver(dan);
      await makeDriver(eve);
      await uploadAll(dan);
      await uploadOk(eve, 'licence');
      await api('delete', '/me', dan).expect(204);
      expect(await database.db.select().from(files)).toHaveLength(1);
      expect(await database.db.select().from(driverDocuments)).toHaveLength(1);
    });
  });
});
