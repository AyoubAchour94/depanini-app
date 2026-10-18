import {
  type DriverJob,
  etaTo,
  type Place,
  PRESENCE_STALE_MS,
  type TowRequest,
} from '@depanini/shared';
import { eq, sql } from 'drizzle-orm';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

import type { Database } from '../db/database.module.js';
import { customerProfiles, driverPresence, driverProfiles, towRequests } from '../db/schema.js';

// How a `tow_requests` row becomes what each side sees. The REST endpoints and the
// realtime events both map rows through here, so an event is never wider than REST.

/** SQL for a point from coordinates (longitude first, as PostGIS wants). */
export const point = ({ latitude, longitude }: Pick<Place, 'latitude' | 'longitude'>) =>
  sql`ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326)::geography`;

/** The columns of `tow_requests` the apps see; coordinates are read back out of the geography. */
export const columns = {
  id: towRequests.id,
  status: towRequests.status,
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
  suggestedFare: towRequests.suggestedFareTnd,
  proposedFare: towRequests.proposedFareTnd,
  expiresAt: towRequests.expiresAt,
  createdAt: towRequests.createdAt,
  agreedFare: towRequests.agreedFareTnd,
  assignedAt: towRequests.assignedAt,
  tripStage: towRequests.tripStage,
  enRouteAt: towRequests.enRouteAt,
  arrivedAt: towRequests.arrivedAt,
  towingAt: towRequests.towingAt,
  completedAt: towRequests.completedAt,
  cancelledBy: towRequests.cancelledBy,
  cancelReason: towRequests.cancelReason,
  // The JS `Date` above keeps milliseconds; the cursor needs the full microseconds.
  createdAtMicros: sql<string>`to_char(${towRequests.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};

/** The assigned driver's contact, from a left join on `driver_profiles` (see {@link selectTowRequests}). */
const driverColumns = {
  driverFullName: driverProfiles.fullName,
  driverPhone: driverProfiles.phone,
  driverTruckType: driverProfiles.truckType,
  driverPlateNumber: driverProfiles.plateNumber,
};

/** The assigned driver's live location, from a left join on `driver_presence`. */
const presenceColumns = {
  driverLatitude: sql<number | null>`ST_Y(${driverPresence.location}::geometry)`,
  driverLongitude: sql<number | null>`ST_X(${driverPresence.location}::geometry)`,
  driverLocationUpdatedAt: driverPresence.locationUpdatedAt,
};

type Row = SelectResultFields<typeof columns> &
  Partial<{
    [K in keyof typeof driverColumns]: SelectResultFields<typeof driverColumns>[K] | null;
  }> &
  Partial<{
    [K in keyof typeof presenceColumns]: SelectResultFields<typeof presenceColumns>[K] | null;
  }>;

/**
 * Requests with their assigned driver's contact and last location. `db` may be a transaction.
 * Pass the rows through {@link toTowRequest} with `now` to expose the location.
 */
export const selectTowRequests = (db: Pick<Database, 'select'>) =>
  db
    .select({ ...columns, ...driverColumns, ...presenceColumns })
    .from(towRequests)
    .leftJoin(driverProfiles, eq(driverProfiles.userId, towRequests.assignedDriverId))
    .leftJoin(driverPresence, eq(driverPresence.userId, towRequests.assignedDriverId));

/**
 * A row as the apps see it. The driver's contact shows while the request is assigned, and
 * stays on a completed one for the trip summary. With `now`, an assigned request also gets
 * the driver's location (if fresh) and the ETA from it: to the pickup before `arrived`, to
 * the drop-off while `towing`.
 */
export function toTowRequest(row: Row, now?: Date): TowRequest {
  const pickup = {
    latitude: Number(row.pickupLatitude),
    longitude: Number(row.pickupLongitude),
    address: row.pickupAddress,
  };
  const dropoff = {
    latitude: Number(row.dropoffLatitude),
    longitude: Number(row.dropoffLongitude),
    address: row.dropoffAddress,
  };
  const updatedAt = row.driverLocationUpdatedAt;
  const driverLocation =
    now &&
    row.status === 'assigned' &&
    row.driverLatitude != null &&
    row.driverLongitude != null &&
    updatedAt &&
    now.getTime() - updatedAt.getTime() <= PRESENCE_STALE_MS
      ? {
          latitude: Number(row.driverLatitude),
          longitude: Number(row.driverLongitude),
          updatedAt: updatedAt.toISOString(),
        }
      : null;
  // A job assigned before trips existed has no stage; it counts as `accepted`.
  const stage = row.tripStage ?? 'accepted';
  const target = stage === 'towing' ? dropoff : stage === 'arrived' ? null : pickup;
  return {
    id: row.id,
    status: row.status,
    pickup,
    dropoff,
    vehicleType: row.vehicleType,
    problemType: row.problemType,
    note: row.note,
    distanceM: row.distanceM,
    suggestedFare: row.suggestedFare,
    proposedFare: row.proposedFare,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    agreedFare: row.agreedFare,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    tripStage: row.tripStage,
    enRouteAt: row.enRouteAt?.toISOString() ?? null,
    arrivedAt: row.arrivedAt?.toISOString() ?? null,
    towingAt: row.towingAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
    driverLocation,
    etaMin: driverLocation && target ? etaTo(target, driverLocation) : null,
    driver:
      (row.status === 'assigned' || row.status === 'completed') && row.driverFullName
        ? {
            fullName: row.driverFullName,
            phone: row.driverPhone!,
            truckType: row.driverTruckType!,
            plateNumber: row.driverPlateNumber!,
          }
        : null,
  };
}

/**
 * Assigned requests with their customer's contact, for {@link toDriverJob}. Filter them
 * to the driver's own job: the contact is only for the assigned driver.
 */
export const selectDriverJobs = (db: Pick<Database, 'select'>) =>
  db
    .select({
      ...columns,
      customerFullName: customerProfiles.fullName,
      customerPhone: customerProfiles.phone,
    })
    .from(towRequests)
    .innerJoin(customerProfiles, eq(customerProfiles.userId, towRequests.customerId));

/** An assigned request as its driver sees it: the request plus the customer's contact. */
export function toDriverJob({
  customerFullName,
  customerPhone,
  ...request
}: Row & { customerFullName: string; customerPhone: string }): DriverJob {
  return {
    ...toTowRequest(request),
    status: 'assigned',
    agreedFare: request.agreedFare!,
    assignedAt: request.assignedAt!.toISOString(),
    customer: { fullName: customerFullName, phone: customerPhone },
  };
}
