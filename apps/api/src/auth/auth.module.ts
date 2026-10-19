import { Global, Module } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';

import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import { AdminGuard } from './admin.guard.js';
import { firebaseApp } from './firebase-app.js';
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
      // Verifying ID tokens needs no service account; see `firebaseApp`.
      useFactory: (env: Env): IdTokenVerifier => getAuth(firebaseApp(env)),
    },
    FirebaseAuthGuard,
    AdminGuard,
  ],
  exports: [ID_TOKEN_VERIFIER, FirebaseAuthGuard, AdminGuard],
})
export class AuthModule {}
