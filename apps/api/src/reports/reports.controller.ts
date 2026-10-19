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
import { type Report, type ReportInput, reportInputSchema } from '@depanini/shared';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReportsService } from './reports.service.js';

/** Reporting a problem on a finished trip, for its customer and its assigned driver. */
@Controller('tow-requests/:id/reports')
@UseGuards(FirebaseAuthGuard)
export class ReportsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * `404` for anyone but the two parties, `400` for a bad body, `409` if the trip is still
   * active, past its window, or the caller already has an open report on it.
   */
  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportInputSchema)) body: ReportInput,
  ): Promise<Report> {
    assertId(id);
    return this.reports.create(await this.accountId(request), id, body);
  }

  /** The caller's own reports on the trip, with their status and resolution note. */
  @Get()
  async mine(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<Report[]> {
    assertId(id);
    return this.reports.mine(await this.accountId(request), id);
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
