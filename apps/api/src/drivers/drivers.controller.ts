import { Body, Controller, ForbiddenException, Get, Put, Req, UseGuards } from '@nestjs/common';
import {
  type DriverPresence,
  type DriverPresenceInput,
  driverPresenceInputSchema,
  type NearbyRequest,
} from '@depanini/shared';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DriversService } from './drivers.service.js';

/** `/driver` — what a driver does once online. Driver app only; needs a driver profile. */
@Controller('driver')
@UseGuards(FirebaseAuthGuard)
export class DriversController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly drivers: DriversService,
  ) {}

  @Put('presence')
  async setPresence(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(driverPresenceInputSchema)) input: DriverPresenceInput,
  ): Promise<DriverPresence> {
    return this.drivers.setPresence(await this.driverId(request), input);
  }

  /** Open requests near the driver, nearest first. Empty when offline, stale or on a job. */
  @Get('requests/nearby')
  async nearby(@Req() request: AuthenticatedRequest): Promise<NearbyRequest[]> {
    return this.drivers.nearby(await this.driverId(request));
  }

  /** The signed-in account's id, if it has a driver profile (`403` otherwise). */
  private async driverId(request: AuthenticatedRequest): Promise<string> {
    const account = await this.accounts.getOrCreateWithProfiles({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    if (!account.driverProfile) throw new ForbiddenException('Complete your driver profile first');
    return account.id;
  }
}
