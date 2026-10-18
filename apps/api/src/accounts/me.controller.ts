import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import {
  type CustomerProfile,
  customerProfileInputSchema,
  type MeResponse,
} from '@depanini/shared';

import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccountsService, type SignInIdentity } from './accounts.service.js';

/**
 * `/me` — the signed-in account. The apps call `GET /me` right after sign-in;
 * the first call creates the account.
 */
@Controller('me')
@UseGuards(FirebaseAuthGuard)
export class MeController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async me(@Req() request: AuthenticatedRequest): Promise<MeResponse> {
    const account = await this.accounts.getOrCreateWithProfiles(identityOf(request));
    return {
      id: account.id,
      email: account.email,
      customerProfile: account.customerProfile,
      driverProfile: null,
    };
  }

  /** Creates or updates the customer profile; the customer app's onboarding and profile screens. */
  @Put('customer-profile')
  async saveCustomerProfile(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(customerProfileInputSchema)) profile: CustomerProfile,
  ): Promise<CustomerProfile> {
    const account = await this.accounts.getOrCreate(identityOf(request));
    return this.accounts.saveCustomerProfile(account.id, profile);
  }
}

function identityOf(request: AuthenticatedRequest): SignInIdentity {
  return { firebaseUid: request.user.uid, email: request.user.email };
}
