import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminDisputeItem,
  type AdminDisputePage,
  type AdminDriverDetail,
  type AdminDriverPage,
  type AdminReport,
  type AdminReportPage,
  type AdminTripDetail,
  type AdminTripPage,
  type AdminUserDetail,
  type AdminUserPage,
  type AuditPage,
  reportStatusSchema,
  type ResolveInput,
  resolveInputSchema,
  type ReviewInput,
  reviewInputSchema,
  towRequestStatusSchema,
  verificationStatusSchema,
} from '@depanini/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { AccountsService } from '../accounts/accounts.service.js';
import { AdminGuard } from '../auth/admin.guard.js';
import type { AuthenticatedRequest } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FILE_STORE, type FileStore } from '../files/file-store.js';
import { sendFile } from '../files/files.controller.js';
import { AdminDriversService } from './admin-drivers.service.js';
import { AdminLookupsService } from './admin-lookups.service.js';
import { AdminQueuesService } from './admin-queues.service.js';
import type { Admin } from './audit-log.js';
import { pageQuerySchema } from './paging.js';

/** A search term: trimmed, at most 100 characters; blank means no search. */
const searchSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((q) => q || undefined);

const driversQuerySchema = pageQuerySchema.extend({
  status: verificationStatusSchema.optional(),
});
const usersQuerySchema = pageQuerySchema.extend({ q: searchSchema });
/** A calendar day, `YYYY-MM-DD` (UTC); impossible dates such as 2026-02-31 are refused. */
const daySchema = z.iso.date().optional();
const tripsQuerySchema = pageQuerySchema.extend({
  status: towRequestStatusSchema.optional(),
  q: searchSchema,
  from: daySchema,
  to: daySchema,
});
const queueQuerySchema = pageQuerySchema.extend({ status: reportStatusSchema.optional() });

/**
 * `/admin/*` — what support does in the admin app: review drivers, look up accounts and
 * trips, work the reports and disputes queues, and read the audit log. Admins only
 * ({@link AdminGuard}); every change writes an audit row.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly drivers: AdminDriversService,
    private readonly lookups: AdminLookupsService,
    private readonly queues: AdminQueuesService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  /** The driver list; `?status=pending` is the review queue, oldest submission first. */
  @Get('drivers')
  async listDrivers(
    @Query(new ZodValidationPipe(driversQuerySchema))
    { status, ...page }: z.output<typeof driversQuerySchema>,
  ): Promise<AdminDriverPage> {
    return this.drivers.list(status, page);
  }

  @Get('drivers/:userId')
  async driver(@Param('userId') userId: string): Promise<AdminDriverDetail> {
    return this.drivers.get(assertId(userId, 'Driver'));
  }

  /** Approves or rejects (with a reason) a `pending` driver; `409` from any other status. */
  @Post('drivers/:userId/review')
  @HttpCode(200)
  async review(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(reviewInputSchema)) input: ReviewInput,
  ): Promise<AdminDriverDetail> {
    assertId(userId, 'Driver');
    return this.drivers.review(await this.admin(request), userId, input);
  }

  /** Any stored file, with the same headers as the owner's `GET /files/:id`. */
  @Get('files/:id')
  async file(@Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
    const file = await this.store.get(assertId(id, 'File'));
    if (!file) throw new NotFoundException('File not found');
    await sendFile(reply, file);
  }

  /** Accounts by email or phone prefix (any case), newest first. */
  @Get('users')
  async users(
    @Query(new ZodValidationPipe(usersQuerySchema))
    { q, ...page }: z.output<typeof usersQuerySchema>,
  ): Promise<AdminUserPage> {
    return this.lookups.users(q, page);
  }

  @Get('users/:id')
  async user(@Param('id') id: string): Promise<AdminUserDetail> {
    return this.lookups.user(assertId(id, 'User'));
  }

  @Get('trips')
  async trips(
    @Query(new ZodValidationPipe(tripsQuerySchema))
    { status, q, from, to, ...page }: z.output<typeof tripsQuerySchema>,
  ): Promise<AdminTripPage> {
    return this.lookups.trips(status, q, { from, to }, page);
  }

  @Get('trips/:id')
  async trip(@Param('id') id: string): Promise<AdminTripDetail> {
    return this.lookups.trip(assertId(id, 'Trip'));
  }

  @Get('reports')
  async reports(
    @Query(new ZodValidationPipe(queueQuerySchema))
    { status, ...page }: z.output<typeof queueQuerySchema>,
  ): Promise<AdminReportPage> {
    return this.queues.reports(status, page);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  async resolveReport(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveInputSchema)) { note }: ResolveInput,
  ): Promise<AdminReport> {
    assertId(id, 'Report');
    return this.queues.resolveReport(await this.admin(request), id, note);
  }

  @Get('disputes')
  async disputes(
    @Query(new ZodValidationPipe(queueQuerySchema))
    { status, ...page }: z.output<typeof queueQuerySchema>,
  ): Promise<AdminDisputePage> {
    return this.queues.disputes(status, page);
  }

  @Post('disputes/:requestId/resolve')
  @HttpCode(200)
  async resolveDispute(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body(new ZodValidationPipe(resolveInputSchema)) { note }: ResolveInput,
  ): Promise<AdminDisputeItem> {
    assertId(requestId, 'Dispute');
    return this.queues.resolveDispute(await this.admin(request), requestId, note);
  }

  @Get('audit')
  async audit(
    @Query(new ZodValidationPipe(pageQuerySchema)) page: z.output<typeof pageQuerySchema>,
  ): Promise<AuditPage> {
    return this.queues.audit(page);
  }

  /** The signed-in admin's account (created on first use, like any other). */
  private async admin(request: AuthenticatedRequest): Promise<Admin> {
    const account = await this.accounts.getOrCreate({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    return { id: account.id, email: account.email };
  }
}

/** A malformed id can't match anything: `404`, like an unknown one. */
function assertId(id: string, what: string): string {
  if (!z.uuid().safeParse(id).success) throw new NotFoundException(`${what} not found`);
  return id;
}
