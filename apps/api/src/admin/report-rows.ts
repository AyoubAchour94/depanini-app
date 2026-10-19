import type { AdminReport } from '@depanini/shared';
import { eq, sql } from 'drizzle-orm';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

import type { Database } from '../db/database.module.js';
import { customerProfiles, driverProfiles, reports, towRequests } from '../db/schema.js';
import { micros } from './paging.js';

/** The columns of a report as support sees it, with the reporter's name for their side. */
export const reportColumns = {
  id: reports.id,
  requestId: reports.requestId,
  category: reports.category,
  note: reports.note,
  status: reports.status,
  resolutionNote: reports.resolutionNote,
  createdAt: reports.createdAt,
  resolvedAt: reports.resolvedAt,
  reporterUserId: reports.reporterUserId,
  reporterRole: reports.reporterRole,
  reporterName: sql<
    string | null
  >`case when ${reports.reporterRole} = 'customer' then ${customerProfiles.fullName} else ${driverProfiles.fullName} end`,
  resolvedBy: reports.resolvedBy,
  pickupAddress: towRequests.pickupAddress,
  /** `created_at` at full precision, for the cursor. */
  createdAtMicros: micros(reports.createdAt),
};

/** Reports with their reporter's name and the trip's pickup. `db` may be a transaction. */
export const selectReports = (db: Pick<Database, 'select'>) =>
  db
    .select(reportColumns)
    .from(reports)
    .innerJoin(towRequests, eq(towRequests.id, reports.requestId))
    .leftJoin(customerProfiles, eq(customerProfiles.userId, reports.reporterUserId))
    .leftJoin(driverProfiles, eq(driverProfiles.userId, reports.reporterUserId));

export type ReportRow = SelectResultFields<typeof reportColumns>;

export function toAdminReport(row: ReportRow): AdminReport {
  return {
    id: row.id,
    requestId: row.requestId,
    category: row.category,
    note: row.note,
    status: row.status,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reporterUserId: row.reporterUserId,
    reporterRole: row.reporterRole,
    reporterName: row.reporterName,
    resolvedBy: row.resolvedBy,
  };
}
