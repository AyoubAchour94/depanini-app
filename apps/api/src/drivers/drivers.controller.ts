import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type DriverJobsPage,
  type DriverPresence,
  type DriverPresenceInput,
  driverPresenceInputSchema,
  type Earnings,
  type NearbyRequest,
} from '@depanini/shared';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { decodeCursor, MAX_PAGE_SIZE } from '../tow-requests/tow-requests.service.js';
import { DriversService } from './drivers.service.js';

const pageQuerySchema = z.object({
  cursor: z
    .string()
    .refine((cursor) => decodeCursor(cursor) !== null, 'Invalid cursor')
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

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

  /** Completed and cancelled jobs, newest first. Paged with the same cursor as the customer history. */
  @Get('jobs')
  async jobs(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(pageQuerySchema))
    { cursor, limit }: z.output<typeof pageQuerySchema>,
  ): Promise<DriverJobsPage> {
    return this.drivers.jobs(await this.driverId(request), { cursor, limit });
  }

  /** Trips and fares today, this week and this month (Africa/Tunis). */
  @Get('earnings')
  async earnings(@Req() request: AuthenticatedRequest): Promise<Earnings> {
    return this.drivers.earnings(await this.driverId(request));
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
