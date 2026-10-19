import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type DisputeInput,
  disputeInputSchema,
  type Receipt,
  type TowRequest,
} from '@depanini/shared';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PaymentsService } from './payments.service.js';

/**
 * The cash payment of a completed trip: the customer's confirm or dispute (customer app) and
 * the receipt (both apps).
 */
@Controller('tow-requests/:id')
@UseGuards(FirebaseAuthGuard)
export class PaymentsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly payments: PaymentsService,
  ) {}

  /** "Yes, I paid": `customer_confirmed`. `409` unless completed and unanswered. */
  @Post('payment/confirm')
  @HttpCode(200)
  async confirm(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<TowRequest> {
    assertId(id);
    return this.payments.confirm(await this.accountId(request), id);
  }

  /** "Report a problem": `disputed`, with the note. `409` unless completed and unanswered. */
  @Post('payment/dispute')
  @HttpCode(200)
  async dispute(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disputeInputSchema)) { note }: DisputeInput,
  ): Promise<TowRequest> {
    assertId(id);
    return this.payments.dispute(await this.accountId(request), id, note);
  }

  /** The receipt, for the customer or the assigned driver once the trip is completed. */
  @Get('receipt')
  async receipt(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<Receipt> {
    assertId(id);
    return this.payments.receipt(await this.accountId(request), id);
  }

  private async accountId(request: AuthenticatedRequest): Promise<string> {
    const account = await this.accounts.getOrCreate({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    return account.id;
  }
}

/** A malformed id can't match anything: `404`, like an unknown one. */
function assertId(id: string): void {
  if (!z.uuid().safeParse(id).success) throw new NotFoundException('Tow request not found');
}
