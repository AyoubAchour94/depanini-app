/**
 * Drizzle table definitions. Tables arrive with their features. PostGIS
 * itself is enabled by the first migration in `drizzle/`.
 */
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
