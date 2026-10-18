/**
 * Drizzle table definitions. Tables arrive with their features. PostGIS
 * itself is enabled by the first migration in `drizzle/`.
 */
import type { TruckType } from '@depanini/shared';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
