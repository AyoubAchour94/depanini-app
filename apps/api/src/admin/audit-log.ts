import type { AdminAction, AuditEntry } from '@depanini/shared';
import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

import type { Database } from '../db/database.module.js';
import { adminActions } from '../db/schema.js';

/** The admin doing something: their account and email (from the ID token). */
export interface Admin {
  id: string;
  email: string | null;
}

/**
 * Writes one row of the audit log. Call it in the transaction that makes the change, so
 * the log has a row exactly when the change happened.
 */
export async function recordAdminAction(
  tx: Pick<Database, 'insert'>,
  admin: Admin,
  action: AdminAction,
  target: { type: AuditEntry['targetType']; id: string },
  details: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await tx.insert(adminActions).values({
    adminUserId: admin.id,
    adminEmail: admin.email,
    action,
    targetType: target.type,
    targetId: target.id,
    details,
    createdAt: at,
  });
}

/** The email of the admin who did `action` on `targetId` (the latest, if more than one). */
export const actorEmail = (action: AdminAction, targetId: SQL | AnyColumn) =>
  sql<string | null>`(
    select ${adminActions.adminEmail} from ${adminActions}
    where ${adminActions.action} = ${action} and ${adminActions.targetId} = ${targetId}::text
    order by ${adminActions.createdAt} desc limit 1
  )`;
