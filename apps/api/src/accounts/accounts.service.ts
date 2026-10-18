import { Inject, Injectable } from '@nestjs/common';
import type { CustomerProfile, DriverProfile } from '@depanini/shared';
import { and, eq, or, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { customerProfiles, driverProfiles, towRequests, users } from '../db/schema.js';
import { isDeadlock } from '../tow-requests/deadlock.js';

/** How often a delete is retried after Postgres broke a deadlock by aborting it. */
const DELETE_ATTEMPTS = 3;

export type Account = typeof users.$inferSelect;

/** The columns of `customer_profiles` the apps see. */
const customerProfileColumns = {
  fullName: customerProfiles.fullName,
  phone: customerProfiles.phone,
};

/** The columns of `driver_profiles` the apps see. */
const driverProfileColumns = {
  fullName: driverProfiles.fullName,
  phone: driverProfiles.phone,
  truckType: driverProfiles.truckType,
  plateNumber: driverProfiles.plateNumber,
};

/** An account with the profiles it holds (`null` until filled in). */
export interface AccountWithProfiles extends Account {
  customerProfile: CustomerProfile | null;
  driverProfile: DriverProfile | null;
}

/** Who signed in, as read from a verified Firebase ID token. */
export interface SignInIdentity {
  firebaseUid: string;
  email?: string;
}

@Injectable()
export class AccountsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Returns the account for this Firebase user, creating it on first sign-in.
   * The email is refreshed on every call, since the user can change it in
   * Firebase.
   */
  async getOrCreate({ firebaseUid, email }: SignInIdentity): Promise<Account> {
    const [account] = await this.db
      .insert(users)
      .values({ firebaseUid, email })
      .onConflictDoUpdate({
        target: users.firebaseUid,
        set: { email: email ?? null, updatedAt: sql`now()` },
      })
      .returning();
    return account!;
  }

  /**
   * Deletes this Firebase user's account; its profiles, requests and offers go
   * with it (cascade). Requests assigned to the account as driver are cancelled
   * first, so their customers are not left waiting for a driver who is gone.
   * Does nothing if there is no account.
   */
  async delete(firebaseUid: string): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.deleteOnce(firebaseUid);
      } catch (error) {
        if (!isDeadlock(error) || attempt === DELETE_ATTEMPTS) throw error;
      }
    }
  }

  private deleteOnce(firebaseUid: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid));
      if (!account) return;

      // Same lock order as accepting an offer: requests, then the driver's profile.
      // The account's pending offers need no update: they cascade away below.
      await tx
        .select({ id: towRequests.id })
        .from(towRequests)
        .where(
          or(eq(towRequests.customerId, account.id), eq(towRequests.assignedDriverId, account.id)),
        )
        .for('update');
      await tx
        .select({ userId: driverProfiles.userId })
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, account.id))
        .for('update');

      const now = new Date();
      await tx
        .update(towRequests)
        .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
        .where(
          and(eq(towRequests.assignedDriverId, account.id), eq(towRequests.status, 'assigned')),
        );
      await tx.delete(users).where(eq(users.id, account.id));
    });
  }

  /** {@link getOrCreate}, plus the account's profiles. */
  async getOrCreateWithProfiles(identity: SignInIdentity): Promise<AccountWithProfiles> {
    const account = await this.getOrCreate(identity);
    const [[customerProfile], [driverProfile]] = await Promise.all([
      this.db
        .select(customerProfileColumns)
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, account.id)),
      this.db
        .select(driverProfileColumns)
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, account.id)),
    ]);
    return {
      ...account,
      customerProfile: customerProfile ?? null,
      driverProfile: driverProfile ?? null,
    };
  }

  /** Creates or replaces the account's customer profile. */
  async saveCustomerProfile(userId: string, profile: CustomerProfile): Promise<CustomerProfile> {
    const [saved] = await this.db
      .insert(customerProfiles)
      .values({ userId, ...profile })
      .onConflictDoUpdate({
        target: customerProfiles.userId,
        set: { ...profile, updatedAt: sql`now()` },
      })
      .returning(customerProfileColumns);
    return saved!;
  }

  /** Creates or replaces the account's driver profile. */
  async saveDriverProfile(userId: string, profile: DriverProfile): Promise<DriverProfile> {
    const [saved] = await this.db
      .insert(driverProfiles)
      .values({ userId, ...profile })
      .onConflictDoUpdate({
        target: driverProfiles.userId,
        set: { ...profile, updatedAt: sql`now()` },
      })
      .returning(driverProfileColumns);
    return saved!;
  }
}
