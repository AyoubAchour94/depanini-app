import { and, eq, lte, type SQL } from 'drizzle-orm';

import type { Database } from '../db/database.module.js';
import { towRequests } from '../db/schema.js';

/**
 * Marks open requests past their expiry as expired (there is no cron yet): the
 * customer's own when `customerId` is given, otherwise everyone's.
 */
export async function expireStaleRequests(
  db: Database,
  now: Date,
  customerId?: string,
): Promise<void> {
  const conditions: (SQL | undefined)[] = [
    eq(towRequests.status, 'open'),
    lte(towRequests.expiresAt, now),
    customerId ? eq(towRequests.customerId, customerId) : undefined,
  ];
  await db
    .update(towRequests)
    .set({ status: 'expired', updatedAt: now })
    .where(and(...conditions));
}
