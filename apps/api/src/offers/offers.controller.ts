import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type CompleteJobInput,
  completeJobInputSchema,
  type CustomerOffer,
  type DriverJob,
  type JobStageInput,
  jobStageInputSchema,
  type Offer,
  type OfferInput,
  offerInputSchema,
  type TowRequest,
} from '@depanini/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OffersService } from './offers.service.js';

/**
 * Offers on tow requests. Drivers (who need a driver profile) make, withdraw and
 * follow them and read their job; customers list, accept and decline the offers
 * on their own requests.
 */
@Controller()
@UseGuards(FirebaseAuthGuard)
export class OffersController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly offers: OffersService,
  ) {}

  @Post('tow-requests/:id/offers')
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('id') requestId: string,
    @Body(new ZodValidationPipe(offerInputSchema)) { fare }: OfferInput,
  ): Promise<Offer> {
    assertId(requestId, 'Tow request not found');
    return this.offers.create(await this.driverId(request), requestId, fare);
  }

  @Post('offers/:id/withdraw')
  @HttpCode(200)
  async withdraw(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<Offer> {
    assertId(id, 'Offer not found');
    return this.offers.withdraw(await this.driverId(request), id);
  }

  /** The driver's offers of the last hour with their current status, newest first. */
  @Get('driver/offers/active')
  async recent(@Req() request: AuthenticatedRequest): Promise<Offer[]> {
    return this.offers.recentForDriver(await this.driverId(request));
  }

  /** The driver's assigned request, or 204 when there is none. */
  @Get('driver/job')
  async job(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DriverJob | undefined> {
    const job = await this.offers.job(await this.driverId(request));
    if (!job) void reply.status(204);
    return job ?? undefined;
  }

  /** Moves the driver's job to its next stage; `409` if `stage` is not the next one. */
  @Post('driver/job/stage')
  @HttpCode(200)
  async stage(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(jobStageInputSchema)) { stage }: JobStageInput,
  ): Promise<DriverJob> {
    return this.offers.advance(await this.driverId(request), stage);
  }

  /**
   * Drops the vehicle off: completes the job, from `towing` only, and records the cash
   * payment of the agreed fare. `400` unless the body confirms `cashReceived`.
   */
  @Post('driver/job/complete')
  @HttpCode(200)
  async complete(
    @Req() request: AuthenticatedRequest,
    // Only validated: the pipe rejects anything but `{ cashReceived: true }`.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body(new ZodValidationPipe(completeJobInputSchema)) _input: CompleteJobInput,
  ): Promise<TowRequest> {
    return this.offers.complete(await this.driverId(request));
  }

  @Get('tow-requests/:id/offers')
  async forRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') requestId: string,
  ): Promise<CustomerOffer[]> {
    assertId(requestId, 'Tow request not found');
    return this.offers.forRequest(await this.accountId(request), requestId);
  }

  /** Assigns the request to the offer's driver. */
  @Post('offers/:id/accept')
  @HttpCode(200)
  async accept(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<TowRequest> {
    assertId(id, 'Offer not found');
    return this.offers.accept(await this.accountId(request), id);
  }

  @Post('offers/:id/decline')
  @HttpCode(200)
  async decline(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<CustomerOffer> {
    assertId(id, 'Offer not found');
    return this.offers.decline(await this.accountId(request), id);
  }

  private async accountId(request: AuthenticatedRequest): Promise<string> {
    const account = await this.accounts.getOrCreate(identityOf(request));
    return account.id;
  }

  /** The signed-in account's id, if it has a driver profile (`403` otherwise). */
  private async driverId(request: AuthenticatedRequest): Promise<string> {
    const account = await this.accounts.getOrCreateWithProfiles(identityOf(request));
    if (!account.driverProfile) throw new ForbiddenException('Complete your driver profile first');
    return account.id;
  }
}

/** A malformed id can't match anything: `404`, like an unknown one. */
function assertId(id: string, message: string): void {
  if (!z.uuid().safeParse(id).success) throw new NotFoundException(message);
}

function identityOf(request: AuthenticatedRequest) {
  return { firebaseUid: request.user.uid, email: request.user.email };
}
