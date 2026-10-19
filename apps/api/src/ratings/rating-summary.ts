import { RATING_NEW_THRESHOLD, type RatingSummary } from '@depanini/shared';
import { type AnyColumn, sql } from 'drizzle-orm';

import { ratings } from '../db/schema.js';

// A user's rating, as the two sides of the marketplace see it: an average and a count.
// Never a comment, and never one rating on its own.

/**
 * Select columns for the rating `rateeId` received from `raterRole`: a driver's customer
 * ratings, or a customer's driver ratings. They are correlated subqueries, so a list of
 * offers or requests gets all its summaries in the one query (no N+1), each answered by
 * the `(ratee_user_id, rater_role)` index.
 */
export function ratingColumns(rateeId: AnyColumn, raterRole: 'customer' | 'driver') {
  const received = sql`from ${ratings} where ${ratings.rateeUserId} = ${rateeId} and ${ratings.raterRole} = ${raterRole}`;
  return {
    ratingCount: sql<number>`(select count(*)::int ${received})`,
    ratingAverage: sql<number | null>`(select avg(${ratings.stars})::float8 ${received})`,
  };
}

/** What {@link ratingColumns} selects. */
export interface RatingRow {
  ratingCount: number;
  ratingAverage: number | null;
}

/**
 * The summary of a row: the count always, the average (to one decimal) only from
 * `RATING_NEW_THRESHOLD` ratings on, so one early rating cannot define someone.
 */
export function toRatingSummary({ ratingCount, ratingAverage }: RatingRow): RatingSummary {
  const count = Number(ratingCount);
  return {
    average:
      count >= RATING_NEW_THRESHOLD && ratingAverage !== null
        ? Math.round(Number(ratingAverage) * 10) / 10
        : null,
    count,
  };
}
