import { Inject, Injectable } from '@nestjs/common';
import type { CustomerProfile } from '@depanini/shared';
import { eq, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { customerProfiles, users } from '../db/schema.js';

export type Account = typeof users.$inferSelect;

/** An account with the profiles it holds (`null` until filled in). */
export interface AccountWithProfiles extends Account {
  customerProfile: CustomerProfile | null;
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

  /** {@link getOrCreate}, plus the account's profiles. */
  async getOrCreateWithProfiles(identity: SignInIdentity): Promise<AccountWithProfiles> {
    const account = await this.getOrCreate(identity);
    const [customerProfile] = await this.db
      .select({ fullName: customerProfiles.fullName, phone: customerProfiles.phone })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, account.id));
    return { ...account, customerProfile: customerProfile ?? null };
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
      .returning({ fullName: customerProfiles.fullName, phone: customerProfiles.phone });
    return saved!;
  }
}
