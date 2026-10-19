import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { MyRating } from '@depanini/shared';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { RatingsService } from './ratings.service.js';

/** The two-way rating of a completed trip, for its customer and its assigned driver. */
@Controller('tow-requests/:id/rating')
@UseGuards(FirebaseAuthGuard)
export class RatingsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly ratings: RatingsService,
  ) {}

  /**
   * Rates the other party: `404` for anyone but the two parties, `400` for a body that fails
   * the caller's side's schema, `409` if the trip is not completed, past its window, already
   * rated by the caller, or the other account was deleted.
   */
  @Post()
  async rate(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MyRating> {
    assertId(id);
    return this.ratings.rate(await this.accountId(request), id, body);
  }

  /** My rating of the trip, whether the other side rated (not their stars), and `canRate`. */
  @Get()
  async mine(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<MyRating> {
    assertId(id);
    return this.ratings.mine(await this.accountId(request), id);
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
