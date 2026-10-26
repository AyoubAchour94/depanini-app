import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canCustomerCancel,
  canDriverCancel,
  type CancelInput,
  customerCancelReasonSchema,
  driverCancelReasonSchema,
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
import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { customerProfiles, towOffers, towRequests } from '../db/schema.js';
import { TripEvents } from '../realtime/trip-events.service.js';
import { CLOCK, type Clock } from './clock.js';
import { expireStaleRequests } from './expiry.js';
import { columns, point, selectTowRequests, toTowRequest } from './tow-request-rows.js';

/** How long an open request waits for drivers. */
const EXPIRY_MS = 15 * 60_000;

/** How long a completed request stays the customer's `active` one, for the trip summary. */
const COMPLETED_VISIBLE_MS = 10 * 60_000;

export const MAX_PAGE_SIZE = 50;

/**
 * Position in the history: the last item of a page. Opaque to the apps.
 * `createdAt` is the sort column's own text at microsecond precision (a JS `Date` would round it);
 * the driver's jobs history keeps its end time (`completed_at` or `cancelled_at`) there.
 */
export interface Cursor {
  createdAt: string;
  id: string;
}

export const encodeCursor = ({ createdAt, id }: Cursor) =>
  Buffer.from(`${createdAt}|${id}`).toString('base64url');

/** The cursor in a string, or `null` if it is not one we issued. */
export function decodeCursor(cursor: string): Cursor | null {
  const [createdAt, id, ...rest] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!createdAt || !id || rest.length) return null;
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!timestamp.test(createdAt) || Number.isNaN(Date.parse(createdAt)) || !uuid.test(id)) {
    return null;
  }
  return { createdAt, id };
}

/** Whether a database error is a unique-constraint violation (Drizzle wraps the driver's error). */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { cause?: { code?: string }; code?: string }) ?? {};
  return (code.cause?.code ?? code.code) === '23505';
}

const badReason = (message: string) =>
  new BadRequestException({ statusCode: 400, message, issues: [{ path: ['reason'], message }] });

@Injectable()
export class TowRequestsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly events: TripEvents,
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
    const [assigned] = await this.db
      .select({ id: towRequests.id })
      .from(towRequests)
      .where(and(eq(towRequests.customerId, customerId), eq(towRequests.status, 'assigned')))
      .limit(1);
    if (assigned) throw new ConflictException('You already have a driver on the way');

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
      await this.events.nearbyChanged([created!.id]);
      return toTowRequest(created!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('You already have an open request');
      throw error;
    }
  }

  /**
   * The customer's open or assigned request (with the driver's contact, last location and
   * ETA), or one completed in the last 10 minutes so the app can show the trip summary;
   * `null` if there is none.
   */
  async active(customerId: string): Promise<TowRequest | null> {
    await this.expireStale(customerId);
    const now = this.now();
    const [row] = await selectTowRequests(this.db)
      .where(
        and(
          eq(towRequests.customerId, customerId),
          or(
            inArray(towRequests.status, ['open', 'assigned']),
            and(
              eq(towRequests.status, 'completed'),
              gt(towRequests.completedAt, new Date(now.getTime() - COMPLETED_VISIBLE_MS)),
            ),
          ),
        ),
      )
      // Should several exist, the assigned one matters most, then the open one.
      .orderBy(
        sql`case ${towRequests.status} when 'assigned' then 0 when 'open' then 1 else 2 end`,
        desc(towRequests.createdAt),
      )
      .limit(1);
    return row ? toTowRequest(row, now) : null;
  }

  /** One of the customer's requests, as the history lists it; `404` if it is not theirs. */
  async findOne(customerId: string, id: string): Promise<TowRequest> {
    await this.expireStale(customerId);
    const [row] = await selectTowRequests(this.db)
      .where(and(eq(towRequests.id, id), eq(towRequests.customerId, customerId)))
      .limit(1);
    if (!row) throw new NotFoundException('Tow request not found');
    return toTowRequest(row);
  }

  /** The customer's requests, newest first. */
  async history(
    customerId: string,
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<TowRequestPage> {
    await this.expireStale(customerId);
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await selectTowRequests(this.db)
      .where(
        and(
          eq(towRequests.customerId, customerId),
          after
            ? sql`(${towRequests.createdAt}, ${towRequests.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(towRequests.createdAt), desc(towRequests.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit).map((row) => toTowRequest(row));
    const last = rows[limit - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.createdAtMicros, id: last.id })
        : null;
    return { items, nextCursor };
  }

  /**
   * Cancels an open request (by its customer) or an assigned one (by its customer or
   * its driver), and rejects its pending offers. `404` if it is neither's, `409` if
   * it is no longer open or assigned, or the trip stage does not allow the caller to
   * cancel (see `canCustomerCancel` / `canDriverCancel`), `400` if a reason is needed
   * and missing, or not in the caller's own list. Records who cancelled; an assigned
   * request also records why, while an open one needs no reason and any given is dropped.
   */
  async cancel(accountId: string, id: string, { reason }: CancelInput = {}): Promise<TowRequest> {
    await this.expireStale(accountId);
    const now = this.now();
    const { cancelled, rejected, wasOpen, byCustomer } = await this.db.transaction(async (tx) => {
      // Locks out a concurrent accept, so a request is never both assigned and cancelled.
      const [row] = await tx
        .select({
          customerId: towRequests.customerId,
          assignedDriverId: towRequests.assignedDriverId,
          status: towRequests.status,
          tripStage: towRequests.tripStage,
          expiresAt: towRequests.expiresAt,
        })
        .from(towRequests)
        .where(eq(towRequests.id, id))
        .for('update');
      if (!row || (row.customerId !== accountId && row.assignedDriverId !== accountId)) {
        throw new NotFoundException('Tow request not found');
      }
      const open = row.status === 'open' && row.expiresAt > now;
      if (!open && row.status !== 'assigned') {
        throw new ConflictException('Only an open or assigned request can be cancelled');
      }

      const byCustomer = row.customerId === accountId;
      const rule = byCustomer ? canCustomerCancel(row) : canDriverCancel(row);
      if (rule === 'no') {
        throw new ConflictException('This request can no longer be cancelled');
      }
      const reasons = byCustomer ? customerCancelReasonSchema : driverCancelReasonSchema;
      if (reason !== undefined && !reasons.safeParse(reason).success) {
        throw badReason('Choose one of the reasons offered');
      }
      if (rule === 'with_reason' && reason === undefined) throw badReason('Give a reason');

      const assigned = row.status === 'assigned';
      const [updated] = await tx
        .update(towRequests)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: byCustomer ? 'customer' : 'driver',
          cancelReason: assigned ? (reason ?? null) : null,
          updatedAt: now,
        })
        .where(eq(towRequests.id, id))
        .returning(columns);
      const rejected = await tx
        .update(towOffers)
        .set({ status: 'rejected', updatedAt: now })
        .where(and(eq(towOffers.requestId, id), eq(towOffers.status, 'pending')))
        .returning({ id: towOffers.id });
      return {
        cancelled: updated!,
        rejected: rejected.map((offer) => offer.id),
        wasOpen: !assigned,
        byCustomer,
      };
    });
    await this.events.requestsUpdated([id], {
      type: 'cancelled',
      cancelledBy: byCustomer ? 'customer' : 'driver',
    });
    await this.events.offersUpdated(rejected, byCustomer ? 'request_cancelled' : 'rejected');
    if (wasOpen) await this.events.nearbyChanged([id]);
    return toTowRequest(cancelled);
  }

  /** Marks the customer's open requests past their expiry as expired. */
  private async expireStale(customerId: string): Promise<void> {
    const expired = await expireStaleRequests(this.db, this.now(), customerId);
    await this.events.nearbyChanged(expired);
  }

  /** The estimated road distance in whole metres: PostGIS straight line times the road factor. */
  private async distanceM(pickup: Place, dropoff: Place): Promise<number> {
    const { rows } = await this.db.execute<{ distance: number }>(
      sql`select round(ST_Distance(${point(pickup)}, ${point(dropoff)}) * ${ROAD_FACTOR}::float8)::int as distance`,
    );
    return Number(rows[0]!.distance);
  }
}
