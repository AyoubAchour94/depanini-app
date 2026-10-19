import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminDisputeItem,
  AdminDisputePage,
  AdminReport,
  AdminReportPage,
  AuditPage,
  ReportStatus,
} from '@depanini/shared';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

import { DB, type Database } from '../db/database.module.js';
import {
  adminActions,
  customerProfiles,
  driverProfiles,
  payments,
  reports,
  towRequests,
} from '../db/schema.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { actorEmail, type Admin, recordAdminAction } from './audit-log.js';
import { keyset, micros, type PageQuery, toPage } from './paging.js';
import { selectReports, toAdminReport } from './report-rows.js';

/** When the customer disputed (it is set on every disputed payment; the fallback never applies). */
const disputedAt = sql`coalesce(${payments.customerAnsweredAt}, ${payments.driverConfirmedAt})`;

const disputeColumns = {
  requestId: payments.requestId,
  receiptNo: payments.receiptNo,
  amountTnd: payments.amountTnd,
  disputeNote: payments.disputeNote,
  customerName: customerProfiles.fullName,
  driverName: driverProfiles.fullName,
  resolutionNote: payments.resolutionNote,
  resolvedByEmail: actorEmail('dispute_resolved', payments.requestId),
  disputedAt: payments.customerAnsweredAt,
  resolvedAt: payments.resolvedAt,
  sortKey: micros(disputedAt),
};

/**
 * The reports and payment disputes queues, resolving them, and the audit log. Open queues
 * come oldest first, so the longest wait is handled first; resolved ones newest first.
 */
@Injectable()
export class AdminQueuesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async reports(
    status: ReportStatus | undefined,
    { cursor, limit }: PageQuery,
  ): Promise<AdminReportPage> {
    const page = keyset(reports.createdAt, reports.id, cursor, status === 'open' ? 'asc' : 'desc');
    const rows = await selectReports(this.db)
      .where(and(status ? eq(reports.status, status) : undefined, page.after))
      .orderBy(...page.orderBy)
      .limit(limit + 1);
    return toPage(
      rows,
      limit,
      (row) => ({ createdAt: row.createdAtMicros, id: row.id }),
      (row) => ({ ...toAdminReport(row), pickupAddress: row.pickupAddress }),
    );
  }

  /** Resolves an open report with a note; `404` if there is none, `409` once resolved. */
  async resolveReport(admin: Admin, reportId: string, note: string): Promise<AdminReport> {
    await this.db.transaction(async (tx) => {
      const [report] = await tx
        .select({ status: reports.status, requestId: reports.requestId })
        .from(reports)
        .where(eq(reports.id, reportId))
        .for('update');
      if (!report) throw new NotFoundException('Report not found');
      if (report.status !== 'open') throw new ConflictException('This report is already resolved');
      const now = this.now();
      await tx
        .update(reports)
        .set({ status: 'resolved', resolutionNote: note, resolvedBy: admin.id, resolvedAt: now })
        .where(eq(reports.id, reportId));
      await recordAdminAction(
        tx,
        admin,
        'report_resolved',
        { type: 'report', id: reportId },
        { note, requestId: report.requestId },
        now,
      );
    });
    const [row] = await selectReports(this.db).where(eq(reports.id, reportId));
    return toAdminReport(row!);
  }

  /** Disputed payments: `open` until support writes a resolution note. */
  async disputes(
    status: 'open' | 'resolved' | undefined,
    { cursor, limit }: PageQuery,
  ): Promise<AdminDisputePage> {
    const page = keyset(disputedAt, payments.requestId, cursor, status === 'open' ? 'asc' : 'desc');
    const rows = await this.selectDisputes()
      .where(
        and(
          eq(payments.status, 'disputed'),
          status === 'open' ? isNull(payments.resolutionNote) : undefined,
          status === 'resolved' ? isNotNull(payments.resolutionNote) : undefined,
          page.after,
        ),
      )
      .orderBy(...page.orderBy)
      .limit(limit + 1);
    return toPage(rows, limit, (row) => ({ createdAt: row.sortKey, id: row.requestId }), toDispute);
  }

  /**
   * Resolves the disputed payment of a trip with a note, kept on the payment. `404` if the
   * trip has no disputed payment, `409` once resolved.
   */
  async resolveDispute(admin: Admin, requestId: string, note: string): Promise<AdminDisputeItem> {
    await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select({ resolutionNote: payments.resolutionNote })
        .from(payments)
        .where(and(eq(payments.requestId, requestId), eq(payments.status, 'disputed')))
        .for('update');
      if (!payment) throw new NotFoundException('No disputed payment on this trip');
      if (payment.resolutionNote !== null) {
        throw new ConflictException('This dispute is already resolved');
      }
      const now = this.now();
      await tx
        .update(payments)
        .set({ resolutionNote: note, resolvedAt: now })
        .where(eq(payments.requestId, requestId));
      await recordAdminAction(
        tx,
        admin,
        'dispute_resolved',
        { type: 'dispute', id: requestId },
        { note },
        now,
      );
    });
    const [row] = await this.selectDisputes().where(eq(payments.requestId, requestId));
    return toDispute(row!);
  }

  /** What admins did, newest first. */
  async audit({ cursor, limit }: PageQuery): Promise<AuditPage> {
    const page = keyset(adminActions.createdAt, adminActions.id, cursor, 'desc');
    const rows = await this.db
      .select({
        id: adminActions.id,
        adminUserId: adminActions.adminUserId,
        adminEmail: adminActions.adminEmail,
        action: adminActions.action,
        targetType: adminActions.targetType,
        targetId: adminActions.targetId,
        details: adminActions.details,
        createdAt: adminActions.createdAt,
        sortKey: micros(adminActions.createdAt),
      })
      .from(adminActions)
      .where(page.after)
      .orderBy(...page.orderBy)
      .limit(limit + 1);
    return toPage(
      rows,
      limit,
      (row) => ({ createdAt: row.sortKey, id: row.id }),
      (row) => ({
        id: row.id,
        adminUserId: row.adminUserId,
        adminEmail: row.adminEmail,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        details: row.details,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  private selectDisputes() {
    return this.db
      .select(disputeColumns)
      .from(payments)
      .innerJoin(towRequests, eq(towRequests.id, payments.requestId))
      .leftJoin(customerProfiles, eq(customerProfiles.userId, towRequests.customerId))
      .leftJoin(driverProfiles, eq(driverProfiles.userId, towRequests.assignedDriverId));
  }
}

function toDispute(
  row: Omit<SelectResultFields<typeof disputeColumns>, 'customerName' | 'driverName'> & {
    customerName: string | null;
    driverName: string | null;
  },
): AdminDisputeItem {
  return {
    requestId: row.requestId,
    receiptNo: row.receiptNo,
    amountTnd: row.amountTnd,
    disputeNote: row.disputeNote,
    customerName: row.customerName,
    driverName: row.driverName,
    status: row.resolutionNote === null ? 'open' : 'resolved',
    resolutionNote: row.resolutionNote,
    resolvedByEmail: row.resolvedByEmail,
    disputedAt: row.disputedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
