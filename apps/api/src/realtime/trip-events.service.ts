import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { driverProfiles, towOffers, towRequests } from '../db/schema.js';
import { customerOfferColumns, toCustomerOffer, toOffer } from '../offers/offer-rows.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import {
  selectDriverJobs,
  selectTowRequests,
  toDriverJob,
  toTowRequest,
} from '../tow-requests/tow-request-rows.js';
import { NotificationsService } from '../push/notifications.service.js';
import { driversNearRequests } from './nearby-drivers.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Tells the people involved in a trip that something changed, over `/ws`, and hands the
 * same changes to {@link NotificationsService} for those who are not connected.
 *
 * Call it **after** the transaction that made the change has committed, with the ids it
 * touched: each method reads the rows back, so a recipient never hears of a change they
 * cannot yet see over REST, and maps them with the REST mappers, so a payload is never
 * wider than what that recipient's own REST endpoints return. Best effort: a failure is
 * logged and never fails the caller (the apps poll as a fallback).
 */
@Injectable()
export class TripEvents {
  private readonly logger = new Logger(TripEvents.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * `request.updated` to each request's customer (as on `GET /tow-requests/active`) and
   * its assigned driver (the job while assigned, as on `GET /driver/job`; else the request).
   */
  async requestsUpdated(ids: string[]): Promise<void> {
    await this.bestEffort('request.updated', async () => {
      if (ids.length === 0) return;
      const now = this.now();
      const parties = await this.db
        .select({
          id: towRequests.id,
          status: towRequests.status,
          customerId: towRequests.customerId,
          driverId: towRequests.assignedDriverId,
        })
        .from(towRequests)
        .where(inArray(towRequests.id, ids));

      for (const { id, status, customerId, driverId } of parties) {
        const toDriver = driverId && this.realtime.isConnected(driverId) ? driverId : null;
        if (!this.realtime.isConnected(customerId) && !toDriver) continue;
        const [row] = await selectTowRequests(this.db).where(eq(towRequests.id, id));
        if (!row) continue;

        this.realtime.send(customerId, {
          type: 'request.updated',
          request: toTowRequest(row, now),
        });
        if (!toDriver) continue;
        const [job] =
          status === 'assigned'
            ? await selectDriverJobs(this.db).where(
                and(eq(towRequests.id, id), eq(towRequests.assignedDriverId, toDriver)),
              )
            : [];
        this.realtime.send(toDriver, {
          type: 'request.updated',
          request: job ? toDriverJob(job) : toTowRequest(row),
        });
      }
    });
    await this.notifications.requestsChanged(ids);
  }

  /** `offer.updated` to each offer's driver (the offer) and its request's customer (with the driver). */
  async offersUpdated(ids: string[]): Promise<void> {
    await this.bestEffort('offer.updated', async () => {
      if (ids.length === 0) return;
      const rows = await this.db
        .select({
          ...customerOfferColumns,
          driverId: towOffers.driverId,
          customerId: towRequests.customerId,
        })
        .from(towOffers)
        .innerJoin(towRequests, eq(towRequests.id, towOffers.requestId))
        .innerJoin(driverProfiles, eq(driverProfiles.userId, towOffers.driverId))
        .where(inArray(towOffers.id, ids));
      for (const row of rows) {
        this.realtime.send(row.driverId, { type: 'offer.updated', offer: toOffer(row) });
        this.realtime.send(row.customerId, { type: 'offer.updated', offer: toCustomerOffer(row) });
      }
    });
    await this.notifications.offersChanged(ids);
  }

  /**
   * Offers that lapsed (marked lazily, on read). Only a push: their drivers are told when
   * they are not connected, and over `/ws` the apps notice the expiry on their own clock.
   */
  async offersExpired(ids: string[]): Promise<void> {
    await this.notifications.offersChanged(ids);
  }

  /**
   * `driver.location` to the customer of the driver's assigned job, with the ETA as on
   * `GET /tow-requests/active`. Nothing without a job, a fresh location or an ETA (once
   * the truck has arrived at the pickup there is none until towing starts).
   */
  async driverMoved(driverId: string): Promise<void> {
    await this.bestEffort('driver.location', async () => {
      const [job] = await this.db
        .select({ id: towRequests.id, customerId: towRequests.customerId })
        .from(towRequests)
        .where(and(eq(towRequests.assignedDriverId, driverId), eq(towRequests.status, 'assigned')));
      if (!job || !this.realtime.isConnected(job.customerId)) return;
      const [row] = await selectTowRequests(this.db).where(eq(towRequests.id, job.id));
      const { driverLocation, etaMin } = row ? toTowRequest(row, this.now()) : {};
      if (!driverLocation || !etaMin) return;
      this.realtime.send(job.customerId, {
        type: 'driver.location',
        requestId: job.id,
        location: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        etaMin,
      });
    });
  }

  /**
   * `nearby.changed` to every online driver with a fresh location within `NEARBY_RADIUS_M`
   * of any of these requests' pickups, bar the request's own customer (the same test as
   * `GET /driver/requests/nearby`, reversed). Call it when a request is created, cancelled,
   * assigned or expired. It carries no data: the app refetches its list. The requests that
   * are still open are also pushed to those drivers who are not connected.
   */
  async nearbyChanged(requestIds: string[]): Promise<void> {
    await this.bestEffort('nearby.changed', async () => {
      const drivers = await driversNearRequests(this.db, this.now(), requestIds);
      for (const userId of new Set(drivers.map((driver) => driver.userId))) {
        this.realtime.send(userId, { type: 'nearby.changed' });
      }
    });
    await this.notifications.requestsOpened(requestIds);
  }

  private async bestEffort(what: string, publish: () => Promise<void>): Promise<void> {
    try {
      await publish();
    } catch (error) {
      this.logger.warn(`Could not publish ${what}: ${(error as Error).message}`);
    }
  }
}
