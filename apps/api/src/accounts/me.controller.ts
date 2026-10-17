import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { MeResponse } from '@depanini/shared';

import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { AccountsService } from './accounts.service.js';

/**
 * `GET /me` — the signed-in account. The apps call it right after sign-in;
 * the first call creates the account.
 */
@Controller('me')
@UseGuards(FirebaseAuthGuard)
export class MeController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async me(@Req() request: AuthenticatedRequest): Promise<MeResponse> {
    const account = await this.accounts.getOrCreate({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    return {
      id: account.id,
      email: account.email,
      customerProfile: null,
      driverProfile: null,
    };
  }
}
