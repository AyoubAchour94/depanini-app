import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  customerRatingInputSchema,
  driverRatingInputSchema,
  type MyRating,
  RATING_WINDOW_DAYS,
} from '@depanini/shared';
import { eq } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { ratings, towRequests } from '../db/schema.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';

const WINDOW_MS = RATING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

type Role = 'customer' | 'driver';

/**
 * The rating of a completed trip, by either party. Ratings are private: nothing is published
 * over the WebSocket, and only the averages (see `rating-summary.ts`) reach the other side.
 *
 * A trip that is not completed, or whose 7-day window (from `completed_at`, inclusive) has
 * passed, is `409 Conflict`, like a second rating: the request exists and is the caller's,
 * but its state does not allow this. `422` is for a malformed body, and that is `400` here.
 */
@Injectable()
export class RatingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  /** Saves the caller's one rating of the other party. */
  async rate(accountId: string, requestId: string, body: unknown): Promise<MyRating> {
    const trip = await this.party(accountId, requestId);
    const schema = trip.role === 'customer' ? customerRatingInputSchema : driverRatingInputSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
      });
    }
    const now = this.now();
    this.assertOpen(trip, now);
    if (!trip.rateeId) {
      throw new ConflictException('The other account no longer exists, so it can not be rated');
    }

    const { stars, tags, comment } = parsed.data;
    const [saved] = await this.db
      .insert(ratings)
      .values({
        requestId,
        raterRole: trip.role,
        rateeUserId: trip.rateeId,
        stars,
        tags,
        comment: comment ?? null,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ requestId: ratings.requestId });
    if (!saved) throw new ConflictException('You already rated this trip');
    return this.mine(accountId, requestId);
  }

  /** The caller's rating of the trip, whether the other side rated, and whether they still can. */
  async mine(accountId: string, requestId: string): Promise<MyRating> {
    const trip = await this.party(accountId, requestId);
    if (trip.status !== 'completed' || !trip.completedAt) {
      throw new ConflictException('Only a completed trip can be rated');
    }
    const rows = await this.db
      .select({
        raterRole: ratings.raterRole,
        stars: ratings.stars,
        tags: ratings.tags,
        comment: ratings.comment,
      })
      .from(ratings)
      .where(eq(ratings.requestId, requestId));
    // Only my own row is read out; for the other side's, just that it exists.
    const mine = rows.find((r) => r.raterRole === trip.role);
    const deadline = new Date(trip.completedAt.getTime() + WINDOW_MS);
    return {
      mine: mine ? { stars: mine.stars, tags: mine.tags, comment: mine.comment } : null,
      otherSideRated: rows.some((r) => r.raterRole !== trip.role),
      canRate: !mine && !!trip.rateeId && this.now() <= deadline,
      deadline: deadline.toISOString(),
    };
  }

  /** `404` unless the caller is the request's customer or its assigned driver. */
  private async party(accountId: string, requestId: string) {
    const [row] = await this.db
      .select({
        customerId: towRequests.customerId,
        driverId: towRequests.assignedDriverId,
        status: towRequests.status,
        completedAt: towRequests.completedAt,
      })
      .from(towRequests)
      .where(eq(towRequests.id, requestId));
    const role: Role | null =
      row?.customerId === accountId ? 'customer' : row?.driverId === accountId ? 'driver' : null;
    if (!row || !role) throw new NotFoundException('Tow request not found');
    return {
      role,
      status: row.status,
      completedAt: row.completedAt,
      // The other party; null once the driver's account is gone.
      rateeId: role === 'customer' ? row.driverId : row.customerId,
    };
  }

  private assertOpen(trip: { status: string; completedAt: Date | null }, now: Date): void {
    if (trip.status !== 'completed' || !trip.completedAt) {
      throw new ConflictException('Only a completed trip can be rated');
    }
    if (now.getTime() > trip.completedAt.getTime() + WINDOW_MS) {
      throw new ConflictException(`A trip can only be rated within ${RATING_WINDOW_DAYS} days`);
    }
  }
}
