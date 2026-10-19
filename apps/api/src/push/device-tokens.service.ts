import { Inject, Injectable } from '@nestjs/common';
import type { DeviceInput } from '@depanini/shared';
import { and, eq, inArray } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { deviceTokens } from '../db/schema.js';

export type AppVariant = DeviceInput['appVariant'];

/** The push tokens of the installs signed in to an account. */
@Injectable()
export class DeviceTokens {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Saves the token for this user; a token that belonged to another user moves to them. */
  async register(userId: string, { token, platform, appVariant }: DeviceInput): Promise<void> {
    await this.db
      .insert(deviceTokens)
      .values({ token, userId, platform, appVariant })
      .onConflictDoUpdate({
        target: deviceTokens.token,
        set: { userId, platform, appVariant, updatedAt: new Date() },
      });
  }

  /** Removes the token if it is this user's; anyone else's is left alone. */
  async unregister(userId: string, token: string): Promise<void> {
    await this.db
      .delete(deviceTokens)
      .where(and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId)));
  }

  /** The user's tokens of one app (all of them without `appVariant`). */
  async forUser(userId: string, appVariant?: AppVariant): Promise<string[]> {
    const rows = await this.db
      .select({ token: deviceTokens.token })
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.userId, userId),
          appVariant ? eq(deviceTokens.appVariant, appVariant) : undefined,
        ),
      );
    return rows.map((row) => row.token);
  }

  /** The user's tokens with the app each belongs to. */
  async variantsOf(userId: string): Promise<{ token: string; appVariant: AppVariant }[]> {
    return this.db
      .select({ token: deviceTokens.token, appVariant: deviceTokens.appVariant })
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, userId));
  }

  /** Forgets tokens the push service said are dead. */
  async remove(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.db.delete(deviceTokens).where(inArray(deviceTokens.token, tokens));
  }
}
