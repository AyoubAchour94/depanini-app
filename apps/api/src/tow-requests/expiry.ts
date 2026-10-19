import { Logger } from '@nestjs/common';
import { and, eq, inArray, lte, type SQL, sql } from 'drizzle-orm';

import type { Database } from '../db/database.module.js';
import { towOffers, towRequests } from '../db/schema.js';
import { isDeadlock, isSerializationFailure } from './deadlock.js';

const logger = new Logger('Expiry');

/**
 * Runs an expiry UPDATE as best effort: every read filters on `expires_at`, so a
 * pass lost to a deadlock or serialization failure is harmless and the next one
 * catches up.
 */
async function bestEffort<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    if (!isDeadlock(error) && !isSerializationFailure(error)) throw error;
    logger.debug(`Skipped expiring ${what}: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Marks open requests past their expiry as expired (there is no cron yet): the
 * customer's own when `customerId` is given, otherwise everyone's. Returns the ids it
 * flipped, so the caller can tell nearby drivers (empty when a pass was skipped).
 */
export async function expireStaleRequests(
  db: Database,
  now: Date,
  customerId?: string,
): Promise<string[]> {
  const conditions: (SQL | undefined)[] = [
    eq(towRequests.status, 'open'),
    lte(towRequests.expiresAt, now),
    customerId ? eq(towRequests.customerId, customerId) : undefined,
  ];
  const expired = await bestEffort('requests', () =>
    db
      .update(towRequests)
      .set({ status: 'expired', updatedAt: now })
      .where(and(...conditions))
      .returning({ id: towRequests.id }),
  );
  return (expired ?? []).map((row) => row.id);
}

/**
 * Marks everyone's pending offers as expired once they are past their expiry,
 * or once their request was cancelled or expired. Run {@link expireStaleRequests}
 * first. Not inside a transaction that holds row locks: it touches other drivers' offers.
 * Returns the ids it flipped, so their drivers can be told (empty when a pass was skipped).
 */
export async function expireStaleOffers(db: Database, now: Date): Promise<string[]> {
  const expired = await bestEffort('offers', () =>
    db
      .update(towOffers)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          eq(towOffers.status, 'pending'),
          sql`(${lte(towOffers.expiresAt, now)} or exists (
            select 1 from ${towRequests}
            where ${towRequests.id} = ${towOffers.requestId}
              and ${inArray(towRequests.status, ['cancelled', 'expired'])}
          ))`,
        ),
      )
      .returning({ id: towOffers.id }),
  );
  return (expired ?? []).map((row) => row.id);
}
