import { RATE_LIMITED } from '@depanini/shared';
import { Controller, Get } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

import type { Env } from '../src/config/env.js';
import { users } from '../src/db/schema.js';
import { createTestApp } from './support/test-app.js';
import { connectTestDatabase } from './support/test-database.js';

/** Stub routes for the timeout: one answers at once, one after half a second. */
@Controller('stub')
class StubController {
  @Get('fast')
  fast() {
    return { ok: true };
  }

  @Get('slow')
  async slow() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: true };
  }
}

describe('HTTP hardening: headers, rate limits, timeout, request id (e2e)', () => {
  const database = connectTestDatabase();
  let app: NestFastifyApplication;

  const start = async (env: Partial<Env> = {}) => {
    app = await createTestApp(database.db, { env, controllers: [StubController] });
  };

  beforeEach(async () => {
    await database.db.delete(users);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await database.close();
  });

  const alice = 'token-alice:alice@example.com';
  const bob = 'token-bob:bob@example.com';
  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const putProfile = (token: string) =>
    request(app.getHttpServer())
      .put('/me/customer-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Alice', phone: '+21698111111' });

  describe('security headers (helmet)', () => {
    it('are on API responses and on /health', async () => {
      await start();

      for (const res of [await get('/me', alice).expect(200), await get('/health')]) {
        expect(res.headers).toMatchObject({
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'SAMEORIGIN',
          'strict-transport-security': expect.stringContaining('max-age='),
          'content-security-policy': expect.stringContaining("default-src 'self'"),
        });
        expect(res.headers['x-powered-by']).toBeUndefined();
      }
    });
  });

  describe('rate limits', () => {
    it('answers 429 with Retry-After once a user goes over the limit, per user', async () => {
      await start({ THROTTLE_LIMIT: 3, THROTTLE_TTL_MS: 60_000 });

      for (let i = 0; i < 3; i += 1) await get('/me', alice).expect(200);
      const res = await get('/me', alice).expect(429);

      expect(res.body).toMatchObject({ statusCode: 429, code: RATE_LIMITED });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
      // Another user, even from the same IP, has a bucket of their own.
      await get('/me', bob).expect(200);
    });

    it('limits signed-out callers by client IP, read through the proxy', async () => {
      await start({ THROTTLE_LIMIT: 2 });
      const from = (ip: string) => get('/me').set('X-Forwarded-For', `10.0.0.9, ${ip}`);

      await from('203.0.113.1').expect(401);
      await from('203.0.113.1').expect(401);
      await from('203.0.113.1').expect(429);
      // The left of X-Forwarded-For is the client's to write; only the proxy's hop counts.
      await get('/me').set('X-Forwarded-For', `10.0.0.10, 203.0.113.1`).expect(429);
      await from('203.0.113.2').expect(401);
    });

    it('counts a bad token against the IP', async () => {
      await start({ THROTTLE_LIMIT: 1 });

      await get('/me', 'not-a-token').expect(401);
      await get('/me', 'still-not-a-token').expect(429);
    });

    it('has a tighter limit for writes', async () => {
      await start({ THROTTLE_LIMIT: 100, THROTTLE_WRITE_LIMIT: 2 });

      await putProfile(alice).expect(200);
      await putProfile(alice).expect(200);
      const res = await putProfile(alice).expect(429);

      expect(res.body).toMatchObject({ code: RATE_LIMITED });
      expect(res.headers['retry-after']).toBeDefined();
      await get('/me', alice).expect(200);
    });

    it('never limits /health', async () => {
      await start({ THROTTLE_LIMIT: 1 });

      for (let i = 0; i < 5; i += 1) expect([200, 503]).toContain((await get('/health')).status);
    });
  });

  describe('request timeout', () => {
    it('answers 503 when a handler runs past REQUEST_TIMEOUT_MS', async () => {
      await start({ REQUEST_TIMEOUT_MS: 100 });

      await get('/stub/fast').expect(200, { ok: true });
      const res = await get('/stub/slow').expect(503);
      expect(res.body).toMatchObject({ statusCode: 503 });
    });
  });

  describe('request id', () => {
    it('echoes the client x-request-id, or makes one up', async () => {
      await start();

      const given = await get('/stub/fast').set('X-Request-Id', 'req-123').expect(200);
      expect(given.headers['x-request-id']).toBe('req-123');
      const made = await get('/stub/fast').expect(200);
      expect(made.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
