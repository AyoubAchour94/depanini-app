import { ForbiddenException } from '@nestjs/common';
import { DRIVER_NOT_APPROVED } from '@depanini/shared';
import { eq } from 'drizzle-orm';

import type { Database } from '../db/database.module.js';
import { driverProfiles } from '../db/schema.js';

/**
 * The verification gate: `403 { code: DRIVER_NOT_APPROVED }` unless the driver's documents
 * were approved. Guards going online, the nearby list and making offers.
 */
export async function assertDriverApproved(db: Database, driverId: string): Promise<void> {
  const [profile] = await db
    .select({ status: driverProfiles.verificationStatus })
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, driverId));
  if (profile?.status !== 'approved') {
    throw new ForbiddenException({
      statusCode: 403,
      code: DRIVER_NOT_APPROVED,
      message: 'Your documents must be approved before you can work',
    });
  }
}
