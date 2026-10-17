import { Global, Module } from '@nestjs/common';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import {
  FirebaseAuthGuard,
  ID_TOKEN_VERIFIER,
  type IdTokenVerifier,
} from './firebase-auth.guard.js';

@Global()
@Module({
  providers: [
    {
      provide: ID_TOKEN_VERIFIER,
      inject: [ENV],
      // Verifying ID tokens only needs the project id (Google's public keys are
      // fetched automatically), so no service-account credentials are required.
      useFactory: (env: Env): IdTokenVerifier =>
        getAuth(getApps()[0] ?? initializeApp({ projectId: env.FIREBASE_PROJECT_ID })),
    },
    FirebaseAuthGuard,
  ],
  exports: [ID_TOKEN_VERIFIER, FirebaseAuthGuard],
})
export class AuthModule {}
