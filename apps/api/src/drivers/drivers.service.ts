import { Inject, Injectable } from '@nestjs/common';
import {
  type DriverJobsPage,
  type DriverPresence,
  type DriverPresenceInput,
  type Earnings,
  fareBounds,
  NEARBY_RADIUS_M,
  type NearbyRequest,
  PRESENCE_STALE_MS,
  ROAD_FACTOR,
} from '@depanini/shared';
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { driverPresence, payments, towOffers, towRequests } from '../db/schema.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { expireStaleOffers, expireStaleRequests } from '../tow-requests/expiry.js';
import { TripEvents } from '../realtime/trip-events.service.js';
import { point, selectTowRequests, toTowRequest } from '../tow-requests/tow-request-rows.js';
import { decodeCursor, encodeCursor } from '../tow-requests/tow-requests.service.js';

/** The time zone of the earnings periods. */
const EARNINGS_TIME_ZONE = 'Africa/Tunis';

/** The most requests the nearby list returns. */
const NEARBY_LIMIT = 30;

const presenceColumns = {
  online: driverPresence.online,
  latitude: sql<number | null>`ST_Y(${driverPresence.location}::geometry)`,
  longitude: sql<number | null>`ST_X(${driverPresence.location}::geometry)`,
  locationUpdatedAt: driverPresence.locationUpdatedAt,
};

interface PresenceRow {
  online: boolean;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: Date | null;
}

function toPresence(row: PresenceRow): DriverPresence {
  return {
    online: row.online,
    location:
      row.latitude === null || row.longitude === null
        ? null
        : { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    locationUpdatedAt: row.locationUpdatedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class DriversService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly events: TripEvents,
  ) {}

  /**
   * Upserts the driver's presence. A location stamps `location_updated_at` from the
   * clock; going offline (or online without a location) leaves the last location alone.
   * During a job, a new location goes to the customer as `driver.location`.
   */
  async setPresence(
    driverId: string,
    { online, location }: DriverPresenceInput,
  ): Promise<DriverPresence> {
    const values = {
      online,
      ...(location ? { location: point(location) as never, locationUpdatedAt: this.now() } : {}),
    };
    const [row] = await this.db
      .insert(driverPresence)
      .values({ userId: driverId, ...values })
      .onConflictDoUpdate({ target: driverPresence.userId, set: values })
      .returning(presenceColumns);
    if (location) await this.events.driverMoved(driverId);
    return toPresence(row!);
  }

  /**
   * The driver's finished jobs (completed or cancelled), newest first by when they ended,
   * then by id. Jobs of a since-deleted driver account have no driver any more, so they
   * are not in anyone's history.
   */
  async jobs(
    driverId: string,
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<DriverJobsPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const endedAt = sql`coalesce(${towRequests.completedAt}, ${towRequests.cancelledAt})`;
    const rows = await selectTowRequests(this.db)
      .where(
        and(
          eq(towRequests.assignedDriverId, driverId),
          inArray(towRequests.status, ['completed', 'cancelled']),
          after
            ? sql`(${endedAt}, ${towRequests.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(endedAt), desc(towRequests.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit).map((row) => toTowRequest(row));
    const last = rows[limit - 1];
    const nextCursor =
      rows.length > limit && last?.endedAtMicros
        ? encodeCursor({ createdAt: last.endedAtMicros, id: last.id })
        : null;
    return { items, nextCursor };
  }

  /**
   * Trips and fares of the driver's completed requests today, this week (from Monday) and
   * this month, counted in Africa/Tunis. Every completed trip counts at its agreed fare,
   * whatever its payment status: a disputed one is still a trip the driver did.
   */
  async earnings(driverId: string): Promise<Earnings> {
    const now = this.now().toISOString();
    // Local wall-clock `now`; truncated there, then converted back to the instant it starts.
    const local = sql`(${now}::timestamptz at time zone ${EARNINGS_TIME_ZONE})`;
    const startOf = (unit: 'day' | 'week' | 'month') =>
      sql`(date_trunc(${sql.raw(`'${unit}'`)}, ${local}) at time zone ${EARNINGS_TIME_ZONE})`;
    const period = (unit: 'day' | 'week' | 'month') => {
      const within = sql`${towRequests.completedAt} >= ${startOf(unit)}`;
      return {
        trips: sql<number>`count(*) filter (where ${within})::int`,
        totalTnd: sql<number>`coalesce(sum(${payments.amountTnd}) filter (where ${within}), 0)::int`,
      };
    };
    const [row] = await this.db
      .select({
        todayTrips: period('day').trips,
        todayTotal: period('day').totalTnd,
        weekTrips: period('week').trips,
        weekTotal: period('week').totalTnd,
        monthTrips: period('month').trips,
        monthTotal: period('month').totalTnd,
      })
      .from(towRequests)
      .innerJoin(payments, eq(payments.requestId, towRequests.id))
      .where(
        and(
          eq(towRequests.assignedDriverId, driverId),
          eq(towRequests.status, 'completed'),
          sql`${towRequests.completedAt} <= ${now}::timestamptz`,
        ),
      );
    return {
      today: { trips: row!.todayTrips, totalTnd: row!.todayTotal },
      week: { trips: row!.weekTrips, totalTnd: row!.weekTotal },
      month: { trips: row!.monthTrips, totalTnd: row!.monthTotal },
    };
  }

  /** Open requests within `NEARBY_RADIUS_M` of the driver, nearest first. */
  async nearby(driverId: string): Promise<NearbyRequest[]> {
    const now = this.now();
    const [row] = await this.db
      .select(presenceColumns)
      .from(driverPresence)
      .where(eq(driverPresence.userId, driverId));
    const here = row && toPresence(row);
    if (
      !here?.online ||
      !here.location ||
      now.getTime() - new Date(here.locationUpdatedAt!).getTime() > PRESENCE_STALE_MS
    ) {
      return [];
    }

    const [job] = await this.db
      .select({ id: towRequests.id })
      .from(towRequests)
      .where(and(eq(towRequests.assignedDriverId, driverId), eq(towRequests.status, 'assigned')))
      .limit(1);
    if (job) return [];

    await expireStaleRequests(this.db, now);
    await expireStaleOffers(this.db, now);

    const origin = point(here.location);
    const distance = sql<number>`ST_Distance(${towRequests.pickup}, ${origin})`;
    const rows = await this.db
      .select({
        id: towRequests.id,
        pickupLatitude: sql<number>`ST_Y(${towRequests.pickup}::geometry)`,
        pickupLongitude: sql<number>`ST_X(${towRequests.pickup}::geometry)`,
        pickupAddress: towRequests.pickupAddress,
        dropoffLatitude: sql<number>`ST_Y(${towRequests.dropoff}::geometry)`,
        dropoffLongitude: sql<number>`ST_X(${towRequests.dropoff}::geometry)`,
        dropoffAddress: towRequests.dropoffAddress,
        vehicleType: towRequests.vehicleType,
        problemType: towRequests.problemType,
        note: towRequests.note,
        distanceM: towRequests.distanceM,
        proposedFare: towRequests.proposedFareTnd,
        suggestedFare: towRequests.suggestedFareTnd,
        expiresAt: towRequests.expiresAt,
        distanceToPickupM: sql<number>`round(${distance} * ${ROAD_FACTOR}::float8)::int`,
        offerId: towOffers.id,
        offerFare: towOffers.fareTnd,
        offerEtaMin: towOffers.etaMin,
        offerDistanceToPickupM: towOffers.distanceToPickupM,
        offerStatus: towOffers.status,
        offerExpiresAt: towOffers.expiresAt,
        offerCreatedAt: towOffers.createdAt,
      })
      .from(towRequests)
      .leftJoin(
        towOffers,
        and(
          eq(towOffers.requestId, towRequests.id),
          eq(towOffers.driverId, driverId),
          eq(towOffers.status, 'pending'),
          gt(towOffers.expiresAt, now),
        ),
      )
      .where(
        and(
          eq(towRequests.status, 'open'),
          gt(towRequests.expiresAt, now),
          ne(towRequests.customerId, driverId),
          sql`ST_DWithin(${towRequests.pickup}, ${origin}, ${NEARBY_RADIUS_M}::float8)`,
        ),
      )
      .orderBy(asc(distance), asc(towRequests.id))
      .limit(NEARBY_LIMIT);

    return rows.map((r) => {
      const { min, max } = fareBounds(r.suggestedFare);
      return {
        id: r.id,
        pickup: {
          latitude: Number(r.pickupLatitude),
          longitude: Number(r.pickupLongitude),
          address: r.pickupAddress,
        },
        dropoff: {
          latitude: Number(r.dropoffLatitude),
          longitude: Number(r.dropoffLongitude),
          address: r.dropoffAddress,
        },
        vehicleType: r.vehicleType,
        problemType: r.problemType,
        note: r.note,
        distanceM: r.distanceM,
        proposedFare: r.proposedFare,
        suggestedFare: r.suggestedFare,
        minFare: min,
        maxFare: max,
        expiresAt: r.expiresAt.toISOString(),
        distanceToPickupM: Number(r.distanceToPickupM),
        myOffer: r.offerId
          ? {
              id: r.offerId,
              requestId: r.id,
              fare: r.offerFare!,
              etaMin: r.offerEtaMin!,
              distanceToPickupM: r.offerDistanceToPickupM!,
              status: r.offerStatus!,
              expiresAt: r.offerExpiresAt!.toISOString(),
              createdAt: r.offerCreatedAt!.toISOString(),
            }
          : null,
      };
    });
  }
}
