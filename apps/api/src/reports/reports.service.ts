import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Report, type ReportInput, REPORT_WINDOW_DAYS } from '@depanini/shared';
import { and, desc, eq } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { reports, towRequests } from '../db/schema.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';

const WINDOW_MS = REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const reportColumns = {
  id: reports.id,
  requestId: reports.requestId,
  category: reports.category,
  note: reports.note,
  status: reports.status,
  resolutionNote: reports.resolutionNote,
  createdAt: reports.createdAt,
  resolvedAt: reports.resolvedAt,
};

/**
 * Problem reports on a finished trip, by its customer or its assigned driver. Support's side
 * (queue, resolving) lives in `admin/`. A trip that is still active or whose 14-day window
 * (from `completed_at` / `cancelled_at`, inclusive) has passed is `409`, like a second open
 * report by the same person; anyone who is not a party gets `404`.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async create(accountId: string, requestId: string, input: ReportInput): Promise<Report> {
    const trip = await this.party(accountId, requestId);
    const now = this.now();
    if (trip.status !== 'completed' && trip.status !== 'cancelled') {
      throw new ConflictException('Only a completed or cancelled trip can be reported');
    }
    const endedAt = trip.status === 'completed' ? trip.completedAt : trip.cancelledAt;
    if (!endedAt || now.getTime() > endedAt.getTime() + WINDOW_MS) {
      throw new ConflictException(`A trip can only be reported within ${REPORT_WINDOW_DAYS} days`);
    }
    const [saved] = await this.db
      .insert(reports)
      .values({
        requestId,
        reporterUserId: accountId,
        reporterRole: trip.role,
        category: input.category,
        note: input.note,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning(reportColumns);
    if (!saved) throw new ConflictException('You already have an open report on this trip');
    return toReport(saved);
  }

  /** The caller's own reports on the trip, newest first. */
  async mine(accountId: string, requestId: string): Promise<Report[]> {
    await this.party(accountId, requestId);
    const rows = await this.db
      .select(reportColumns)
      .from(reports)
      .where(and(eq(reports.requestId, requestId), eq(reports.reporterUserId, accountId)))
      .orderBy(desc(reports.createdAt), desc(reports.id));
    return rows.map(toReport);
  }

  /** `404` unless the caller is the request's customer or its assigned driver. */
  private async party(accountId: string, requestId: string) {
    const [row] = await this.db
      .select({
        customerId: towRequests.customerId,
        driverId: towRequests.assignedDriverId,
        status: towRequests.status,
        completedAt: towRequests.completedAt,
        cancelledAt: towRequests.cancelledAt,
      })
      .from(towRequests)
      .where(eq(towRequests.id, requestId));
    const role: 'customer' | 'driver' | null =
      row?.customerId === accountId ? 'customer' : row?.driverId === accountId ? 'driver' : null;
    if (!row || !role) throw new NotFoundException('Tow request not found');
    return { role, status: row.status, completedAt: row.completedAt, cancelledAt: row.cancelledAt };
  }
}

function toReport(row: {
  id: string;
  requestId: string;
  category: Report['category'];
  note: string;
  status: Report['status'];
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): Report {
  return {
    id: row.id,
    requestId: row.requestId,
    category: row.category,
    note: row.note,
    status: row.status,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
