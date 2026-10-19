import { NEARBY_RADIUS_M, PRESENCE_STALE_MS } from '@depanini/shared';
import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';

import type { Database } from '../db/database.module.js';
import { driverPresence, towRequests } from '../db/schema.js';

/**
 * Which online drivers with a fresh location are within `NEARBY_RADIUS_M` of each of these
 * requests' pickups, bar the request's own customer: the same test as
 * `GET /driver/requests/nearby`, reversed. One row per driver and request.
 */
export async function driversNearRequests(
  db: Database,
  now: Date,
  requestIds: string[],
): Promise<{ userId: string; requestId: string }[]> {
  if (requestIds.length === 0) return [];
  return db
    .selectDistinct({ userId: driverPresence.userId, requestId: towRequests.id })
    .from(driverPresence)
    .innerJoin(
      towRequests,
      sql`ST_DWithin(${towRequests.pickup}, ${driverPresence.location}, ${NEARBY_RADIUS_M}::float8)`,
    )
    .where(
      and(
        inArray(towRequests.id, requestIds),
        eq(driverPresence.online, true),
        gt(driverPresence.locationUpdatedAt, new Date(now.getTime() - PRESENCE_STALE_MS)),
        ne(driverPresence.userId, towRequests.customerId),
      ),
    );
}
