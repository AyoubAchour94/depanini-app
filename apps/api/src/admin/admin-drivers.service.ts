import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminDriverDetail,
  AdminDriverItem,
  AdminDriverPage,
  ReviewInput,
  VerificationStatus,
} from '@depanini/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

import { DB, type Database } from '../db/database.module.js';
import { driverProfiles, users } from '../db/schema.js';
import { NotificationsService } from '../push/notifications.service.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { listDocuments } from '../verification/verification.service.js';
import { type Admin, recordAdminAction } from './audit-log.js';
import { keyset, micros, type PageQuery, toPage } from './paging.js';

const driverColumns = {
  userId: driverProfiles.userId,
  fullName: driverProfiles.fullName,
  email: users.email,
  phone: driverProfiles.phone,
  truckType: driverProfiles.truckType,
  plateNumber: driverProfiles.plateNumber,
  verificationStatus: driverProfiles.verificationStatus,
  submittedAt: driverProfiles.submittedAt,
};

const toItem = (row: SelectResultFields<typeof driverColumns>): AdminDriverItem => ({
  userId: row.userId,
  fullName: row.fullName,
  email: row.email,
  phone: row.phone,
  truckType: row.truckType,
  plateNumber: row.plateNumber,
  verificationStatus: row.verificationStatus,
  submittedAt: row.submittedAt?.toISOString() ?? null,
});

/** The driver queue and list, one driver's documents, and the review that approves them. */
@Injectable()
export class AdminDriversService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Drivers, optionally of one status. The `pending` queue comes oldest submission first,
   * so reviews go in order; any other list newest driver first.
   */
  async list(
    status: VerificationStatus | undefined,
    { cursor, limit }: PageQuery,
  ): Promise<AdminDriverPage> {
    const queue = status === 'pending';
    const sortKey = queue
      ? sql`coalesce(${driverProfiles.submittedAt}, ${driverProfiles.createdAt})`
      : driverProfiles.createdAt;
    const page = keyset(sortKey, driverProfiles.userId, cursor, queue ? 'asc' : 'desc');
    const rows = await this.db
      .select({ ...driverColumns, sortKey: micros(sortKey) })
      .from(driverProfiles)
      .innerJoin(users, eq(users.id, driverProfiles.userId))
      .where(and(status ? eq(driverProfiles.verificationStatus, status) : undefined, page.after))
      .orderBy(...page.orderBy)
      .limit(limit + 1);
    return toPage(rows, limit, (row) => ({ createdAt: row.sortKey, id: row.userId }), toItem);
  }

  /** One driver's profile, check and documents; `404` without a driver profile. */
  async get(driverId: string): Promise<AdminDriverDetail> {
    const [row] = await this.db
      .select({
        ...driverColumns,
        rejectionReason: driverProfiles.rejectionReason,
        reviewedAt: driverProfiles.reviewedAt,
        reviewedBy: driverProfiles.reviewedBy,
      })
      .from(driverProfiles)
      .innerJoin(users, eq(users.id, driverProfiles.userId))
      .where(eq(driverProfiles.userId, driverId));
    if (!row) throw new NotFoundException('Driver not found');
    const { rejectionReason, reviewedAt, reviewedBy, ...item } = row;
    return {
      ...toItem(item),
      rejectionReason,
      reviewedAt: reviewedAt?.toISOString() ?? null,
      reviewedBy,
      documents: await listDocuments(this.db, driverId),
    };
  }

  /**
   * Approves or rejects a `pending` driver (`409` from any other status), stamps who and
   * when, writes the audit row in the same transaction, then pushes the result to the driver.
   */
  async review(admin: Admin, driverId: string, input: ReviewInput): Promise<AdminDriverDetail> {
    const approved = input.decision === 'approve';
    const reason = input.decision === 'reject' ? input.reason : null;
    await this.db.transaction(async (tx) => {
      const [profile] = await tx
        .select({ status: driverProfiles.verificationStatus })
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, driverId))
        .for('update');
      if (!profile) throw new NotFoundException('Driver not found');
      if (profile.status !== 'pending') {
        throw new ConflictException(
          `Only pending drivers can be reviewed (this one is ${profile.status})`,
        );
      }
      const now = this.now();
      await tx
        .update(driverProfiles)
        .set({
          verificationStatus: approved ? 'approved' : 'rejected',
          rejectionReason: reason,
          reviewedAt: now,
          reviewedBy: admin.id,
          updatedAt: now,
        })
        .where(eq(driverProfiles.userId, driverId));
      await recordAdminAction(
        tx,
        admin,
        approved ? 'driver_approved' : 'driver_rejected',
        { type: 'driver', id: driverId },
        approved ? { decision: 'approve' } : { decision: 'reject', reason },
        now,
      );
    });
    this.notifications.verificationReviewed(driverId, approved);
    return this.get(driverId);
  }
}
