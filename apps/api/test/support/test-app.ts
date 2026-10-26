import type { Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { AppModule } from '../../src/app.module.js';
import { ID_TOKEN_VERIFIER, type IdTokenVerifier } from '../../src/auth/firebase-auth.guard.js';
import { ENV } from '../../src/config/env.module.js';
import {
  DEFAULT_REALTIME_OPTIONS,
  REALTIME_OPTIONS,
  type RealtimeOptions,
} from '../../src/realtime/realtime.gateway.js';
import { PUSH_SENDER, type PushSender } from '../../src/push/push-sender.js';
import { type Env, parseEnv } from '../../src/config/env.js';
import { CLOCK } from '../../src/tow-requests/clock.js';
import { type Database, DB } from '../../src/db/database.module.js';
import { configureApp, createFastifyAdapter } from '../../src/http/configure-app.js';
import { TEST_DATABASE_URL } from './test-database.js';

/**
 * The environment of the e2e app: the real defaults, with the rate limits raised so the
 * suites' many calls never hit them (`throttling.e2e-spec.ts` lowers them again) and
 * the request logs off. `overrides` win.
 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      FIREBASE_PROJECT_ID: 'depanini-test',
      THROTTLE_LIMIT: '1000000',
      THROTTLE_WRITE_LIMIT: '1000000',
      LOG_LEVEL: 'silent',
    }),
    PORT: 0,
    ...overrides,
  };
}

/**
 * Accepts `token-<uid>` (with an optional `:<email>`, then optional custom claims as
 * `|<json>`, e.g. `|{"admin":true}`) as a valid ID token, valid for an hour.
 */
export const fakeVerifier: IdTokenVerifier = {
  verifyIdToken: async (token) => {
    const match = /^token-([^:|]+)(?::([^|]+))?(?:\|(.+))?$/.exec(token);
    if (!match) throw new Error('auth/argument-error');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const claims = match[3] ? (JSON.parse(match[3]) as object) : {};
    return { ...claims, uid: match[1], email: match[2], exp } as DecodedIdToken;
  },
};

/** A fake ID token (see {@link fakeVerifier}) of an admin: custom claim `admin: true`. */
export const adminToken = (uid: string, email = `${uid}@example.com`) =>
  `token-${uid}:${email}|${JSON.stringify({ admin: true })}`;

/**
 * The whole API over the test database, with Firebase replaced by
 * {@link fakeVerifier} (or `verifier`). `realtime` shortens the WebSocket timers;
 * call `app.listen(0, '127.0.0.1')` to connect sockets. Close it with `app.close()`
 * after the suite.
 */
export async function createTestApp(
  db: Database,
  {
    now,
    verifier = fakeVerifier,
    realtime,
    env: envOverrides,
    pushSender,
    controllers = [],
  }: {
    now?: () => Date;
    verifier?: IdTokenVerifier;
    realtime?: Partial<RealtimeOptions>;
    /** Overrides of the test environment (e.g. `PUSH_INBOX: true`), see {@link testEnv}. */
    env?: Partial<Env>;
    /** Replaces the log push sender. */
    pushSender?: PushSender;
    /** Extra controllers mounted next to the API's, e.g. a deliberately slow stub. */
    controllers?: Type[];
  } = {},
): Promise<NestFastifyApplication> {
  const env = testEnv(envOverrides);
  const builder = Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(DB)
    .useValue(db)
    .overrideProvider(ID_TOKEN_VERIFIER)
    .useValue(verifier);
  if (pushSender) builder.overrideProvider(PUSH_SENDER).useValue(pushSender);
  if (now) builder.overrideProvider(CLOCK).useValue(now);
  if (realtime) {
    builder
      .overrideProvider(REALTIME_OPTIONS)
      .useValue({ ...DEFAULT_REALTIME_OPTIONS, ...realtime });
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(env));
  await configureApp(app, env);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
