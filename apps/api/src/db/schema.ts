/**
 * Drizzle table definitions. Tables arrive with their features. PostGIS
 * itself is enabled by the first migration in `drizzle/`.
 */
import type {
  OfferStatus,
  ProblemType,
  TowRequestStatus,
  TruckType,
  VehicleType,
} from '@depanini/shared';
import { sql } from 'drizzle-orm';
import {
  customType,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** An account: one person's sign-in identity, shared by both apps (see GLOSSARY.md). */
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  /** Firebase Auth uid; the link between a verified ID token and this row. */
  firebaseUid: text('firebase_uid').notNull().unique(),
  email: text(),
  ...timestamps,
});

/** What a customer gave before using the customer app. At most one per account. */
export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  /** Normalized Tunisian number (`+216` + 8 digits); contact info, not verified. */
  phone: text().notNull(),
  ...timestamps,
});

/**
 * What a driver gave before using the driver app. At most one per account.
 * Drivers are self-serve for now; an approval status would be a column here.
 */
export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  /** Normalized Tunisian number (`+216` + 8 digits); contact info, not verified. */
  phone: text().notNull(),
  /** Checked by the API (`TRUCK_TYPES`); text, so adding a type needs no migration. */
  truckType: text('truck_type').$type<TruckType>().notNull(),
  /** Trimmed and upper-cased; not checked against a pattern. */
  plateNumber: text('plate_number').notNull(),
  ...timestamps,
});

/**
 * A PostGIS `geography(Point, 4326)` column. Written and read through SQL
 * (`ST_MakePoint`, `ST_X`/`ST_Y`), so the driver value is never used.
 */
const geographyPoint = customType<{ data: never; driverData: string }>({
  dataType: () => 'geography(Point, 4326)',
});

/**
 * A customer's request for a tow. It stays `open` until the customer cancels
 * it or it expires (marked lazily, on read). Assignment comes in Phase 4.
 */
export const towRequests = pgTable(
  'tow_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text().$type<TowRequestStatus>().notNull().default('open'),
    pickup: geographyPoint().notNull(),
    pickupAddress: text('pickup_address').notNull(),
    dropoff: geographyPoint().notNull(),
    dropoffAddress: text('dropoff_address').notNull(),
    /** Checked by the API (`VEHICLE_TYPES`); text, so adding a type needs no migration. */
    vehicleType: text('vehicle_type').$type<VehicleType>().notNull(),
    /** Checked by the API (`PROBLEM_TYPES`). */
    problemType: text('problem_type').$type<ProblemType>().notNull(),
    note: text(),
    /** Estimated road distance in metres: PostGIS straight line times `ROAD_FACTOR`. */
    distanceM: integer('distance_m').notNull(),
    suggestedFareTnd: integer('suggested_fare_tnd').notNull(),
    proposedFareTnd: integer('proposed_fare_tnd').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** Set when the customer accepts an offer; the request is then `assigned`. */
    assignedDriverId: uuid('assigned_driver_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** The fare of the accepted offer. */
    agreedFareTnd: integer('agreed_fare_tnd'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('tow_requests_pickup_idx').using('gist', table.pickup),
    index('tow_requests_customer_created_idx').on(table.customerId, table.createdAt.desc()),
    // A customer has at most one open request.
    uniqueIndex('tow_requests_one_open_per_customer_idx')
      .on(table.customerId)
      .where(sql`${table.status} = 'open'`),
  ],
);

/** Whether a driver is online and where they last were. At most one row per driver. */
export const driverPresence = pgTable(
  'driver_presence',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    online: boolean().notNull().default(false),
    location: geographyPoint(),
    locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }),
  },
  (table) => [index('driver_presence_location_idx').using('gist', table.location)],
);

/** A driver's offer on an open request: the customer's fare, or a counter. */
export const towOffers = pgTable(
  'tow_offers',
  {
    id: uuid().primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => towRequests.id, { onDelete: 'cascade' }),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fareTnd: integer('fare_tnd').notNull(),
    /** Estimated road distance from the driver to the pickup when the offer was made. */
    distanceToPickupM: integer('distance_to_pickup_m').notNull(),
    etaMin: integer('eta_min').notNull(),
    status: text().$type<OfferStatus>().notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('tow_offers_request_idx').on(table.requestId),
    index('tow_offers_driver_idx').on(table.driverId),
    // A driver has at most one pending offer per request.
    uniqueIndex('tow_offers_one_pending_per_driver_idx')
      .on(table.requestId, table.driverId)
      .where(sql`${table.status} = 'pending'`),
  ],
);
