import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CustomerOffer,
  type DriverJob,
  etaMinutes,
  fareBounds,
  isFareAllowed,
  type JobStageInput,
  NEARBY_RADIUS_M,
  nextTripStage,
  OFFER_TTL_MS,
  type Offer,
  PRESENCE_STALE_MS,
  ROAD_FACTOR,
  type TowRequest,
  type TripStage,
} from '@depanini/shared';
import { and, asc, desc, eq, gt, ne, sql } from 'drizzle-orm';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

import { DB, type Database } from '../db/database.module.js';
import {
  customerProfiles,
  driverPresence,
  driverProfiles,
  towOffers,
  towRequests,
} from '../db/schema.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { isDeadlock } from '../tow-requests/deadlock.js';
import { expireStaleOffers, expireStaleRequests } from '../tow-requests/expiry.js';
import {
  columns as requestColumns,
  isUniqueViolation,
  point,
  selectTowRequests,
  toTowRequest,
} from '../tow-requests/tow-requests.service.js';

/** How far back `GET /driver/offers/active` looks. */
const RECENT_OFFERS_MS = 60 * 60_000;

/** How often an accept is retried after Postgres broke a deadlock by aborting it. */
const ACCEPT_ATTEMPTS = 3;

/** The timestamp column each stage sets when the driver reaches it. */
const STAGE_TIMESTAMPS = {
  en_route: 'enRouteAt',
  arrived: 'arrivedAt',
  towing: 'towingAt',
} as const;

/** The columns of `tow_offers` the apps see. */
const offerColumns = {
  id: towOffers.id,
  requestId: towOffers.requestId,
  fare: towOffers.fareTnd,
  etaMin: towOffers.etaMin,
  distanceToPickupM: towOffers.distanceToPickupM,
  status: towOffers.status,
  expiresAt: towOffers.expiresAt,
  createdAt: towOffers.createdAt,
};

type OfferRow = SelectResultFields<typeof offerColumns>;

function toOffer(row: OfferRow): Offer {
  return {
    ...row,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

const customerOfferColumns = {
  ...offerColumns,
  driverFullName: driverProfiles.fullName,
  driverTruckType: driverProfiles.truckType,
};

function toCustomerOffer({
  driverFullName,
  driverTruckType,
  ...row
}: OfferRow & { driverFullName: string; driverTruckType: CustomerOffer['driver']['truckType'] }) {
  return { ...toOffer(row), driver: { fullName: driverFullName, truckType: driverTruckType } };
}

/**
 * Offers and their outcome: drivers make and withdraw them, customers accept or
 * decline them, and an accepted one becomes the driver's job.
 *
 * Lock order, everywhere: the request row, then the driver's profile row, then
 * offer rows. Taking them in one order keeps concurrent accepts from deadlocking.
 */
@Injectable()
export class OffersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  /**
   * A driver's offer on an open request near them. `404` if there is no such request
   * (or it is the driver's own), `400` for a fare outside the bounds, `409` if the
   * request is no longer open, the driver is offline or too far, has a job, or
   * already has a pending offer on it.
   */
  async create(driverId: string, requestId: string, fare: number): Promise<Offer> {
    const now = await this.expireStale();
    const [presence] = await this.db
      .select({
        online: driverPresence.online,
        latitude: sql<number | null>`ST_Y(${driverPresence.location}::geometry)`,
        longitude: sql<number | null>`ST_X(${driverPresence.location}::geometry)`,
        locationUpdatedAt: driverPresence.locationUpdatedAt,
      })
      .from(driverPresence)
      .where(eq(driverPresence.userId, driverId));
    const here =
      presence?.online &&
      presence.latitude !== null &&
      presence.longitude !== null &&
      presence.locationUpdatedAt &&
      now.getTime() - presence.locationUpdatedAt.getTime() <= PRESENCE_STALE_MS
        ? point({ latitude: Number(presence.latitude), longitude: Number(presence.longitude) })
        : null;

    try {
      return await this.db.transaction(async (tx) => {
        // Shared locks: offers on one request don't block each other, but an accept or
        // cancel waits for them (and they for it), so no offer lands on a closed request.
        const [request] = await tx
          .select({
            customerId: towRequests.customerId,
            status: towRequests.status,
            expiresAt: towRequests.expiresAt,
            suggestedFare: towRequests.suggestedFareTnd,
            inRange: here
              ? sql<boolean>`ST_DWithin(${towRequests.pickup}, ${here}, ${NEARBY_RADIUS_M}::float8)`
              : sql<boolean>`false`,
            distanceToPickupM: here
              ? sql<number>`round(ST_Distance(${towRequests.pickup}, ${here}) * ${ROAD_FACTOR}::float8)::int`
              : sql<number>`0`,
          })
          .from(towRequests)
          .where(eq(towRequests.id, requestId))
          .for('share');
        if (!request || request.customerId === driverId) {
          throw new NotFoundException('Tow request not found');
        }
        if (request.status !== 'open' || request.expiresAt <= now) {
          throw new ConflictException('This request is no longer open');
        }
        if (!here) throw new ConflictException('Go online to make offers');
        if (!request.inRange) throw new ConflictException('This request is too far away');
        if (!isFareAllowed(fare, request.suggestedFare)) {
          const { min, max } = fareBounds(request.suggestedFare);
          const message = `Fare must be between ${min} and ${max} TND`;
          throw new BadRequestException({
            statusCode: 400,
            message,
            issues: [{ path: ['fare'], message }],
          });
        }

        await tx
          .select({ userId: driverProfiles.userId })
          .from(driverProfiles)
          .where(eq(driverProfiles.userId, driverId))
          .for('share');
        if (await this.hasJob(tx, driverId)) {
          throw new ConflictException('Finish your current job first');
        }

        const distanceToPickupM = Number(request.distanceToPickupM);
        const [offer] = await tx
          .insert(towOffers)
          .values({
            requestId,
            driverId,
            fareTnd: fare,
            distanceToPickupM,
            etaMin: etaMinutes(distanceToPickupM),
            expiresAt: new Date(now.getTime() + OFFER_TTL_MS),
            createdAt: now,
            updatedAt: now,
          })
          .returning(offerColumns);
        return toOffer(offer!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('You already have a pending offer on this request');
      }
      throw error;
    }
  }

  /** Withdraws the driver's own pending offer. `404` if it is not theirs, `409` if not pending. */
  async withdraw(driverId: string, offerId: string): Promise<Offer> {
    const now = await this.expireStale();
    const [withdrawn] = await this.db
      .update(towOffers)
      .set({ status: 'withdrawn', updatedAt: now })
      .where(
        and(
          eq(towOffers.id, offerId),
          eq(towOffers.driverId, driverId),
          eq(towOffers.status, 'pending'),
          gt(towOffers.expiresAt, now),
        ),
      )
      .returning(offerColumns);
    if (withdrawn) return toOffer(withdrawn);

    const [existing] = await this.db
      .select({ id: towOffers.id })
      .from(towOffers)
      .where(and(eq(towOffers.id, offerId), eq(towOffers.driverId, driverId)));
    if (!existing) throw new NotFoundException('Offer not found');
    throw new ConflictException('Only a pending offer can be withdrawn');
  }

  /** The driver's offers of the last hour, newest first. */
  async recentForDriver(driverId: string): Promise<Offer[]> {
    const now = await this.expireStale();
    const rows = await this.db
      .select(offerColumns)
      .from(towOffers)
      .where(
        and(
          eq(towOffers.driverId, driverId),
          gt(towOffers.createdAt, new Date(now.getTime() - RECENT_OFFERS_MS)),
        ),
      )
      .orderBy(desc(towOffers.createdAt), desc(towOffers.id));
    return rows.map(toOffer);
  }

  /** The pending offers on the customer's request, lowest fare first. `404` if it is not theirs. */
  async forRequest(customerId: string, requestId: string): Promise<CustomerOffer[]> {
    const [request] = await this.db
      .select({ id: towRequests.id })
      .from(towRequests)
      .where(and(eq(towRequests.id, requestId), eq(towRequests.customerId, customerId)));
    if (!request) throw new NotFoundException('Tow request not found');

    const now = await this.expireStale();
    const rows = await this.db
      .select(customerOfferColumns)
      .from(towOffers)
      .innerJoin(driverProfiles, eq(driverProfiles.userId, towOffers.driverId))
      .where(
        and(
          eq(towOffers.requestId, requestId),
          eq(towOffers.status, 'pending'),
          gt(towOffers.expiresAt, now),
        ),
      )
      .orderBy(asc(towOffers.fareTnd), asc(towOffers.createdAt), asc(towOffers.id));
    return rows.map(toCustomerOffer);
  }

  /** Declines a pending offer on the customer's request. `404` if not theirs, `409` if not pending. */
  async decline(customerId: string, offerId: string): Promise<CustomerOffer> {
    const now = await this.expireStale();
    const owned = sql`exists (
      select 1 from ${towRequests}
      where ${towRequests.id} = ${towOffers.requestId} and ${towRequests.customerId} = ${customerId}
    )`;
    const [declined] = await this.db
      .update(towOffers)
      .set({ status: 'declined', updatedAt: now })
      .where(
        and(
          eq(towOffers.id, offerId),
          eq(towOffers.status, 'pending'),
          gt(towOffers.expiresAt, now),
          owned,
        ),
      )
      .returning({ id: towOffers.id });

    const [offer] = await this.db
      .select(customerOfferColumns)
      .from(towOffers)
      .innerJoin(driverProfiles, eq(driverProfiles.userId, towOffers.driverId))
      .where(and(eq(towOffers.id, offerId), owned));
    if (!offer) throw new NotFoundException('Offer not found');
    if (!declined) throw new ConflictException('Only a pending offer can be declined');
    return toCustomerOffer(offer);
  }

  /**
   * Accepts an offer on the customer's request: the request becomes `assigned` to
   * its driver at the offer's fare, the offer `accepted`, the request's other
   * pending offers `rejected`, and the driver's pending offers elsewhere `withdrawn`.
   * `404` if the offer is not on the customer's request; `409` if the request or the
   * offer is no longer pending, or the driver has another job.
   */
  async accept(customerId: string, offerId: string): Promise<TowRequest> {
    const now = await this.expireStale();
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.acceptOnce(customerId, offerId, now);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('This driver has just taken another job');
        }
        if (!isDeadlock(error) || attempt === ACCEPT_ATTEMPTS) throw error;
      }
    }
  }

  private acceptOnce(customerId: string, offerId: string, now: Date): Promise<TowRequest> {
    return this.db.transaction(async (tx) => {
      // The offer's request and driver never change, so they can be read before locking.
      const [target] = await tx
        .select({ requestId: towOffers.requestId, driverId: towOffers.driverId })
        .from(towOffers)
        .where(eq(towOffers.id, offerId));
      if (!target) throw new NotFoundException('Offer not found');

      const [request] = await tx
        .select({
          customerId: towRequests.customerId,
          status: towRequests.status,
          expiresAt: towRequests.expiresAt,
        })
        .from(towRequests)
        .where(eq(towRequests.id, target.requestId))
        .for('update');
      if (!request || request.customerId !== customerId) {
        throw new NotFoundException('Offer not found');
      }
      if (request.status !== 'open' || request.expiresAt <= now) {
        throw new ConflictException('This request is no longer open');
      }

      // One driver, one job: two accepts of the same driver's offers queue up here.
      const [driver] = await tx
        .select({ userId: driverProfiles.userId })
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, target.driverId))
        .for('update');
      if (!driver || (await this.hasJob(tx, target.driverId))) {
        throw new ConflictException('This driver has just taken another job');
      }

      const [offer] = await tx
        .select({
          status: towOffers.status,
          expiresAt: towOffers.expiresAt,
          fare: towOffers.fareTnd,
        })
        .from(towOffers)
        .where(eq(towOffers.id, offerId))
        .for('update');
      if (offer!.status !== 'pending' || offer!.expiresAt <= now) {
        throw new ConflictException('This offer is no longer available');
      }

      await tx
        .update(towRequests)
        .set({
          status: 'assigned',
          assignedDriverId: target.driverId,
          agreedFareTnd: offer!.fare,
          assignedAt: now,
          tripStage: 'accepted',
          updatedAt: now,
        })
        .where(eq(towRequests.id, target.requestId));
      await tx
        .update(towOffers)
        .set({ status: 'accepted', updatedAt: now })
        .where(eq(towOffers.id, offerId));
      await tx
        .update(towOffers)
        .set({ status: 'rejected', updatedAt: now })
        .where(
          and(
            eq(towOffers.requestId, target.requestId),
            eq(towOffers.status, 'pending'),
            ne(towOffers.id, offerId),
          ),
        );
      await tx
        .update(towOffers)
        .set({ status: 'withdrawn', updatedAt: now })
        .where(
          and(
            eq(towOffers.driverId, target.driverId),
            eq(towOffers.status, 'pending'),
            ne(towOffers.requestId, target.requestId),
          ),
        );

      const [assigned] = await selectTowRequests(tx).where(eq(towRequests.id, target.requestId));
      return toTowRequest(assigned!, now);
    });
  }

  /** The driver's assigned request with the customer's contact, or `null`. */
  async job(driverId: string): Promise<DriverJob | null> {
    const [row] = await this.db
      .select({
        ...requestColumns,
        customerFullName: customerProfiles.fullName,
        customerPhone: customerProfiles.phone,
      })
      .from(towRequests)
      .innerJoin(customerProfiles, eq(customerProfiles.userId, towRequests.customerId))
      .where(and(eq(towRequests.assignedDriverId, driverId), eq(towRequests.status, 'assigned')));
    if (!row) return null;
    const { customerFullName, customerPhone, ...request } = row;
    return {
      ...toTowRequest(request),
      status: 'assigned',
      agreedFare: request.agreedFare!,
      assignedAt: request.assignedAt!.toISOString(),
      customer: { fullName: customerFullName, phone: customerPhone },
    };
  }

  /**
   * Moves the driver's job to its next trip stage and stamps the time. `404` if the
   * driver has no job, `409` unless `stage` is the very next one.
   */
  async advance(driverId: string, stage: JobStageInput['stage']): Promise<DriverJob> {
    const now = this.now();
    await this.db.transaction(async (tx) => {
      const job = await this.lockJob(tx, driverId);
      if (nextTripStage(job.tripStage ?? 'accepted') !== stage) {
        throw new ConflictException('That is not the next step of this trip');
      }
      await tx
        .update(towRequests)
        .set({ tripStage: stage, [STAGE_TIMESTAMPS[stage]]: now, updatedAt: now })
        .where(eq(towRequests.id, job.id));
    });
    return (await this.job(driverId))!;
  }

  /** Completes the driver's job (dropped off). `404` if there is none, `409` unless towing. */
  async complete(driverId: string): Promise<TowRequest> {
    const now = this.now();
    return this.db.transaction(async (tx) => {
      const job = await this.lockJob(tx, driverId);
      if (job.tripStage !== 'towing') {
        throw new ConflictException('Complete the trip once the vehicle is on the truck');
      }
      await tx
        .update(towRequests)
        .set({ status: 'completed', completedAt: now, updatedAt: now })
        .where(eq(towRequests.id, job.id));
      const [completed] = await selectTowRequests(tx).where(eq(towRequests.id, job.id));
      return toTowRequest(completed!);
    });
  }

  /**
   * The driver's assigned request, locked `FOR UPDATE` (the same first lock as accept and
   * cancel). `404` if there is none, also when it was cancelled while waiting for the lock.
   */
  private async lockJob(
    tx: Pick<Database, 'select'>,
    driverId: string,
  ): Promise<{ id: string; tripStage: TripStage | null }> {
    const [found] = await tx
      .select({ id: towRequests.id })
      .from(towRequests)
      .where(and(eq(towRequests.assignedDriverId, driverId), eq(towRequests.status, 'assigned')));
    if (!found) throw new NotFoundException('You have no job');
    const [job] = await tx
      .select({
        id: towRequests.id,
        status: towRequests.status,
        assignedDriverId: towRequests.assignedDriverId,
        tripStage: towRequests.tripStage,
      })
      .from(towRequests)
      .where(eq(towRequests.id, found.id))
      .for('update');
    if (job?.status !== 'assigned' || job.assignedDriverId !== driverId) {
      throw new NotFoundException('You have no job');
    }
    return job;
  }

  /** Whether the driver has an assigned request. `db` may be a transaction. */
  private async hasJob(db: Pick<Database, 'select'>, driverId: string): Promise<boolean> {
    const [job] = await db
      .select({ id: towRequests.id })
      .from(towRequests)
      .where(and(eq(towRequests.assignedDriverId, driverId), eq(towRequests.status, 'assigned')))
      .limit(1);
    return Boolean(job);
  }

  /** Runs the lazy expiry of requests and offers, and returns the time it used. */
  private async expireStale(): Promise<Date> {
    const now = this.now();
    await expireStaleRequests(this.db, now);
    await expireStaleOffers(this.db, now);
    return now;
  }
}
