import { Inject, Injectable } from '@nestjs/common';
import {
  type DriverPresence,
  type DriverPresenceInput,
  fareBounds,
  NEARBY_RADIUS_M,
  type NearbyRequest,
  PRESENCE_STALE_MS,
  ROAD_FACTOR,
} from '@depanini/shared';
import { and, asc, eq, gt, ne, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { driverPresence, towOffers, towRequests } from '../db/schema.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { expireStaleOffers, expireStaleRequests } from '../tow-requests/expiry.js';
import { TripEvents } from '../realtime/trip-events.service.js';
import { point } from '../tow-requests/tow-request-rows.js';

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
