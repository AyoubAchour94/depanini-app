import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { AppModule } from '../../src/app.module.js';
import { ID_TOKEN_VERIFIER, type IdTokenVerifier } from '../../src/auth/firebase-auth.guard.js';
import { ENV } from '../../src/config/env.module.js';
import { CLOCK } from '../../src/tow-requests/clock.js';
import { type Database, DB } from '../../src/db/database.module.js';
import { TEST_DATABASE_URL } from './test-database.js';

/** Accepts `token-<uid>` (with an optional `:<email>`) as a valid ID token. */
const fakeVerifier: IdTokenVerifier = {
  verifyIdToken: async (token) => {
    const match = /^token-([^:]+)(?::(.+))?$/.exec(token);
    if (!match) throw new Error('auth/argument-error');
    return { uid: match[1], email: match[2] } as DecodedIdToken;
  },
};

/**
 * The whole API over the test database, with Firebase replaced by
 * {@link fakeVerifier}. Close it with `app.close()` after the suite.
 */
export async function createTestApp(
  db: Database,
  { now }: { now?: () => Date } = {},
): Promise<NestFastifyApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({
      NODE_ENV: 'test',
      PORT: 0,
      DATABASE_URL: TEST_DATABASE_URL,
      FIREBASE_PROJECT_ID: 'depanini-test',
      CORS_ORIGINS: [],
    })
    .overrideProvider(DB)
    .useValue(db)
    .overrideProvider(ID_TOKEN_VERIFIER)
    .useValue(fakeVerifier);
  if (now) builder.overrideProvider(CLOCK).useValue(now);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
