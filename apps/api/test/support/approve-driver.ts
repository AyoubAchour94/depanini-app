import { eq } from 'drizzle-orm';

import type { Database } from '../../src/db/database.module.js';
import { driverProfiles, users } from '../../src/db/schema.js';

/**
 * Approves a driver's documents directly in the database, so suites that put drivers
 * online do not have to upload and review documents. The driver profile must exist.
 */
export async function approveDriver(db: Database, userId: string): Promise<void> {
  const approved = await db
    .update(driverProfiles)
    .set({ verificationStatus: 'approved', reviewedAt: new Date() })
    .where(eq(driverProfiles.userId, userId))
    .returning({ userId: driverProfiles.userId });
  if (approved.length === 0) throw new Error(`approveDriver: ${userId} has no driver profile`);
}

/** {@link approveDriver} for the account of a fake ID token (`token-<uid>[:<email>]`). */
export async function approveDriverByToken(db: Database, token: string): Promise<void> {
  const uid = /^token-([^:]+)/.exec(token)?.[1];
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.firebaseUid, uid ?? ''));
  if (!account) throw new Error(`approveDriverByToken: no account for ${token}`);
  await approveDriver(db, account.id);
}
