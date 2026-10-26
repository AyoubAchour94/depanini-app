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
import type { OfferEvent, RequestEvent } from '../push/push-event.js';
import { EVENT_BUS, type EventBus, type TripEvent } from './event-bus.js';
import { driversNearRequests } from './nearby-drivers.js';
import { RealtimeService } from './realtime.service.js';

/** Ids per bus event: 100 UUIDs keep a NOTIFY payload near 4 kB, under its 8000-byte cap. */
const IDS_PER_EVENT = 100;

/**
 * Tells the people involved in a trip that something changed, over `/ws`, and hands the
 * same changes to {@link NotificationsService} for those who are not connected.
 *
 * Call it **after** the transaction that made the change has committed, with the ids it
 * touched. The ids go out on the {@link EventBus}, so every API instance hears of them;
 * each instance then reads the rows back and tells its own sockets. Reading back means a
 * recipient never hears of a change they cannot yet see over REST, and the REST mappers
 * mean a payload is never wider than what that recipient's own REST endpoints return.
 * This instance's sockets are told before a method resolves. Best effort: a failure is
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
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {
    bus.subscribe((event) => this.deliver(event));
  }

  /**
   * `request.updated` to each request's customer (as on `GET /tow-requests/active`) and
   * its assigned driver (the job while assigned, as on `GET /driver/job`; else the request).
   * `event` is what the caller just did, for the push; `null` when nothing is to be pushed.
   */
  async requestsUpdated(ids: string[], event: RequestEvent | null): Promise<void> {
    for (const chunk of chunks(ids)) await this.publish({ type: 'requests.updated', ids: chunk });
    this.notifications.requestsChanged(ids, event);
  }

  /**
   * `offer.updated` to each offer's driver (the offer) and its request's customer (with the driver).
   * `event` is what the caller just did to them, for the push.
   */
  async offersUpdated(ids: string[], event: OfferEvent): Promise<void> {
    for (const chunk of chunks(ids)) await this.publish({ type: 'offers.updated', ids: chunk });
    this.notifications.offersChanged(ids, event);
  }

  /**
   * Offers that lapsed (marked lazily, on read). Only a push: their drivers are told when
   * they are not connected, and over `/ws` the apps notice the expiry on their own clock.
   */
  async offersExpired(ids: string[]): Promise<void> {
    this.notifications.offersChanged(ids, 'expired');
  }

  /**
   * `driver.location` to the customer of the driver's assigned job, with the ETA as on
   * `GET /tow-requests/active`. Nothing without a job, a fresh location or an ETA (once
   * the truck has arrived at the pickup there is none until towing starts).
   */
  async driverMoved(driverId: string): Promise<void> {
    await this.publish({ type: 'driver.moved', driverId });
  }

  /**
   * `nearby.changed` to every online driver with a fresh location within `NEARBY_RADIUS_M`
   * of any of these requests' pickups, bar the request's own customer (the same test as
   * `GET /driver/requests/nearby`, reversed). Call it when a request is created, cancelled,
   * assigned or expired. It carries no data: the app refetches its list. The requests that
   * are still open are also pushed to those drivers who are not connected.
   */
  async nearbyChanged(requestIds: string[]): Promise<void> {
    for (const chunk of chunks(requestIds)) {
      await this.publish({ type: 'nearby.changed', requestIds: chunk });
    }
    this.notifications.requestsOpened(requestIds);
  }

  private async publish(event: TripEvent): Promise<void> {
    try {
      await this.bus.publish(event);
    } catch (error) {
      this.logger.warn(`Could not publish ${event.type}: ${(error as Error).message}`);
    }
  }

  /** Tells this instance's sockets of an event from any instance; reads nothing if none is open. */
  private async deliver(event: TripEvent): Promise<void> {
    if (!this.realtime.hasSockets()) return;
    switch (event.type) {
      case 'requests.updated':
        return this.bestEffort('request.updated', () => this.sendRequests(event.ids));
      case 'offers.updated':
        return this.bestEffort('offer.updated', () => this.sendOffers(event.ids));
      case 'driver.moved':
        return this.bestEffort('driver.location', () => this.sendLocation(event.driverId));
      case 'nearby.changed':
        return this.bestEffort('nearby.changed', () => this.sendNearby(event.requestIds));
    }
  }

  private async sendRequests(ids: string[]): Promise<void> {
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
  }

  private async sendOffers(ids: string[]): Promise<void> {
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
  }

  private async sendLocation(driverId: string): Promise<void> {
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
  }

  private async sendNearby(requestIds: string[]): Promise<void> {
    const drivers = await driversNearRequests(this.db, this.now(), requestIds);
    for (const userId of new Set(drivers.map((driver) => driver.userId))) {
      this.realtime.send(userId, { type: 'nearby.changed' });
    }
  }

  private async bestEffort(what: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.warn(`Could not publish ${what}: ${(error as Error).message}`);
    }
  }
}

/** `ids` in groups of {@link IDS_PER_EVENT}; none for none. */
function chunks(ids: string[]): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_EVENT) groups.push(ids.slice(i, i + IDS_PER_EVENT));
  return groups;
}
