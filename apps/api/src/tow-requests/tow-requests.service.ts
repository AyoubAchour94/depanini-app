import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type FareEstimate,
  type FareEstimateInput,
  fareBounds,
  isFareAllowed,
  type Place,
  ROAD_FACTOR,
  suggestFare,
  type TowRequest,
  type TowRequestInput,
  type TowRequestPage,
} from '@depanini/shared';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

import { DB, type Database } from '../db/database.module.js';
import { customerProfiles, towRequests } from '../db/schema.js';
import { CLOCK, type Clock } from './clock.js';

/** How long an open request waits for drivers. */
const EXPIRY_MS = 15 * 60_000;

export const MAX_PAGE_SIZE = 50;

/** SQL for a point from coordinates (longitude first, as PostGIS wants). */
const point = ({ latitude, longitude }: Place) =>
  sql`ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326)::geography`;

/** The columns of `tow_requests` the apps see; coordinates are read back out of the geography. */
const columns = {
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
};

type Row = SelectResultFields<typeof columns>;

function toTowRequest(row: Row): TowRequest {
  return {
    id: row.id,
    status: row.status,
    pickup: {
      latitude: Number(row.pickupLatitude),
      longitude: Number(row.pickupLongitude),
      address: row.pickupAddress,
    },
    dropoff: {
      latitude: Number(row.dropoffLatitude),
      longitude: Number(row.dropoffLongitude),
      address: row.dropoffAddress,
    },
    vehicleType: row.vehicleType,
    problemType: row.problemType,
    note: row.note,
    distanceM: row.distanceM,
    suggestedFare: row.suggestedFare,
    proposedFare: row.proposedFare,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Position in the history: the last item of a page. Opaque to the apps. */
interface Cursor {
  createdAt: Date;
  id: string;
}

const encodeCursor = ({ createdAt, id }: Cursor) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');

/** The cursor in a string, or `null` if it is not one we issued. */
export function decodeCursor(cursor: string): Cursor | null {
  const [createdAt, id, ...rest] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!createdAt || !id || rest.length) return null;
  const date = new Date(createdAt);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (Number.isNaN(date.getTime()) || !uuid.test(id)) return null;
  return { createdAt: date, id };
}

/** Whether a database error is a unique-constraint violation (Drizzle wraps the driver's error). */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { cause?: { code?: string }; code?: string }) ?? {};
  return (code.cause?.code ?? code.code) === '23505';
}

@Injectable()
export class TowRequestsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  /** The distance and fare bounds for a trip. The API never trusts a client price. */
  async estimate({ pickup, dropoff, vehicleType }: FareEstimateInput): Promise<FareEstimate> {
    const distanceM = await this.distanceM(pickup as Place, dropoff as Place);
    const suggestedFare = suggestFare(distanceM, vehicleType);
    const { min, max } = fareBounds(suggestedFare);
    return { distanceM, suggestedFare, minFare: min, maxFare: max };
  }

  async create(customerId: string, input: TowRequestInput): Promise<TowRequest> {
    const [profile] = await this.db
      .select({ userId: customerProfiles.userId })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, customerId));
    if (!profile) throw new ForbiddenException('Complete your customer profile first');

    const pickup = input.pickup as Place;
    const dropoff = input.dropoff as Place;
    const distanceM = await this.distanceM(pickup, dropoff);
    const suggestedFare = suggestFare(distanceM, input.vehicleType);
    if (!isFareAllowed(input.proposedFare, suggestedFare)) {
      const { min, max } = fareBounds(suggestedFare);
      const message = `Proposed fare must be between ${min} and ${max} TND`;
      throw new BadRequestException({
        statusCode: 400,
        message,
        issues: [{ path: ['proposedFare'], message }],
      });
    }

    await this.expireStale(customerId);
    const now = this.now();
    try {
      const [created] = await this.db
        .insert(towRequests)
        .values({
          customerId,
          pickup: point(pickup) as never,
          pickupAddress: pickup.address,
          dropoff: point(dropoff) as never,
          dropoffAddress: dropoff.address,
          vehicleType: input.vehicleType,
          problemType: input.problemType,
          note: input.note ?? null,
          distanceM,
          suggestedFareTnd: suggestedFare,
          proposedFareTnd: input.proposedFare,
          expiresAt: new Date(now.getTime() + EXPIRY_MS),
          createdAt: now,
          updatedAt: now,
        })
        .returning(columns);
      return toTowRequest(created!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('You already have an open request');
      throw error;
    }
  }

  /** The customer's open request, or `null`. */
  async active(customerId: string): Promise<TowRequest | null> {
    await this.expireStale(customerId);
    const [row] = await this.db
      .select(columns)
      .from(towRequests)
      .where(and(eq(towRequests.customerId, customerId), eq(towRequests.status, 'open')));
    return row ? toTowRequest(row) : null;
  }

  /** The customer's requests, newest first. */
  async history(
    customerId: string,
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<TowRequestPage> {
    await this.expireStale(customerId);
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await this.db
      .select(columns)
      .from(towRequests)
      .where(
        and(
          eq(towRequests.customerId, customerId),
          after
            ? sql`(${towRequests.createdAt}, ${towRequests.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(towRequests.createdAt), desc(towRequests.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit).map(toTowRequest);
    const last = rows[limit - 1];
    const nextCursor =
      rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;
    return { items, nextCursor };
  }

  /** Cancels the customer's own open request. `404` if it is not theirs, `409` if not open. */
  async cancel(customerId: string, id: string): Promise<TowRequest> {
    await this.expireStale(customerId);
    const now = this.now();
    const [cancelled] = await this.db
      .update(towRequests)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(
        and(
          eq(towRequests.id, id),
          eq(towRequests.customerId, customerId),
          eq(towRequests.status, 'open'),
        ),
      )
      .returning(columns);
    if (cancelled) return toTowRequest(cancelled);

    const [existing] = await this.db
      .select({ id: towRequests.id })
      .from(towRequests)
      .where(and(eq(towRequests.id, id), eq(towRequests.customerId, customerId)));
    if (!existing) throw new NotFoundException('Tow request not found');
    throw new ConflictException('Only an open request can be cancelled');
  }

  /** Marks the customer's open requests past their expiry as expired (there is no cron yet). */
  private async expireStale(customerId: string): Promise<void> {
    const now = this.now();
    await this.db
      .update(towRequests)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          eq(towRequests.customerId, customerId),
          eq(towRequests.status, 'open'),
          lte(towRequests.expiresAt, now),
        ),
      );
  }

  /** The estimated road distance in whole metres: PostGIS straight line times the road factor. */
  private async distanceM(pickup: Place, dropoff: Place): Promise<number> {
    const { rows } = await this.db.execute<{ distance: number }>(
      sql`select round(ST_Distance(${point(pickup)}, ${point(dropoff)}) * ${ROAD_FACTOR}::float8)::int as distance`,
    );
    return Number(rows[0]!.distance);
  }
}
