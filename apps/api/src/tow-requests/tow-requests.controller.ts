import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type CancelInput,
  cancelInputSchema,
  type FareEstimate,
  type FareEstimateInput,
  fareEstimateInputSchema,
  type TowRequest,
  type TowRequestInput,
  type TowRequestPage,
  towRequestInputSchema,
} from '@depanini/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { decodeCursor, MAX_PAGE_SIZE, TowRequestsService } from './tow-requests.service.js';

const pageQuerySchema = z.object({
  cursor: z
    .string()
    .refine((cursor) => decodeCursor(cursor) !== null, 'Invalid cursor')
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

/** `/tow-requests` — a customer's requests for a tow. Customer app, except cancelling a job. */
@Controller('tow-requests')
@UseGuards(FirebaseAuthGuard)
export class TowRequestsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly towRequests: TowRequestsService,
  ) {}

  /** The suggested fare and its bounds for a trip, before the customer commits. */
  @Post('estimate')
  @HttpCode(200)
  estimate(
    @Body(new ZodValidationPipe(fareEstimateInputSchema)) input: FareEstimateInput,
  ): Promise<FareEstimate> {
    return this.towRequests.estimate(input);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(towRequestInputSchema)) input: TowRequestInput,
  ): Promise<TowRequest> {
    const account = await this.accounts.getOrCreate(identityOf(request));
    return this.towRequests.create(account.id, input);
  }

  /** The customer's open or assigned request, or 204 when there is none. */
  @Get('active')
  async active(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TowRequest | undefined> {
    const account = await this.accounts.getOrCreate(identityOf(request));
    const active = await this.towRequests.active(account.id);
    if (!active) void reply.status(204);
    return active ?? undefined;
  }

  @Get()
  async history(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(pageQuerySchema))
    { cursor, limit }: z.output<typeof pageQuerySchema>,
  ): Promise<TowRequestPage> {
    const account = await this.accounts.getOrCreate(identityOf(request));
    return this.towRequests.history(account.id, { cursor, limit });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelInputSchema.optional())) input?: CancelInput,
  ): Promise<TowRequest> {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException('Tow request not found');
    const account = await this.accounts.getOrCreate(identityOf(request));
    return this.towRequests.cancel(account.id, id, input);
  }
}

function identityOf(request: AuthenticatedRequest) {
  return { firebaseUid: request.user.uid, email: request.user.email };
}
