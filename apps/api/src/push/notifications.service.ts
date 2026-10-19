import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { PushData, PushKind } from '@depanini/shared';
import { and, eq, gt, inArray } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { towOffers, towRequests } from '../db/schema.js';
import { driversNearRequests } from '../realtime/nearby-drivers.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { type AppVariant, DeviceTokens } from './device-tokens.service.js';
import { CUSTOMER_CANCELLED_BODY, PUSH_MESSAGES, TRIP_STAGE_BODIES } from './messages.js';
import type { OfferEvent, RequestEvent } from './push-event.js';
import { PUSH_SENDER, type PushSender } from './push-sender.js';

/** The longest shutdown waits for pushes still on their way. */
export const SHUTDOWN_FLUSH_MS = 5000;

/** One push to one person: which app gets it, and what it says. */
export interface Push {
  userId: string;
  appVariant: AppVariant;
  data: PushData;
  /** Replaces the kind's default body. */
  body?: string;
}

export interface RequestParties {
  customerId: string;
  driverId: string | null;
}

export interface OfferParties {
  requestId: string;
  driverId: string;
  customerId: string;
}

/** The push a request event calls for, if any. Customers hear `user`, drivers `driver`. */
export function requestPush(
  requestId: string,
  event: RequestEvent,
  { customerId, driverId }: RequestParties,
): Push | null {
  const toCustomer = (kind: PushKind, body?: string): Push => ({
    userId: customerId,
    appVariant: 'user',
    data: { kind, requestId },
    body,
  });
  const toDriver = (kind: PushKind): Push | null =>
    driverId ? { userId: driverId, appVariant: 'driver', data: { kind, requestId } } : null;

  switch (event.type) {
    case 'stage':
      return toCustomer('trip_stage', TRIP_STAGE_BODIES[event.stage]);
    case 'completed':
      return toCustomer('trip_completed');
    case 'payment_answered':
      return toDriver('payment_answered');
    case 'cancelled':
      // Cancelled while open has no driver to tell (its pending offers are told per offer).
      return event.cancelledBy === 'customer'
        ? toDriver('trip_cancelled')
        : toCustomer('trip_cancelled');
  }
}

/** The push an offer event calls for, if any. */
export function offerPush(offerId: string, event: OfferEvent, offer: OfferParties): Push | null {
  const { requestId } = offer;
  const toDriver = (kind: PushKind, body?: string): Push => ({
    userId: offer.driverId,
    appVariant: 'driver',
    data: { kind, requestId, offerId },
    body,
  });
  switch (event) {
    case 'received':
      return {
        userId: offer.customerId,
        appVariant: 'user',
        data: { kind: 'offer_received', requestId, offerId },
      };
    case 'accepted':
      return toDriver('offer_accepted');
    case 'rejected':
    case 'declined':
      return toDriver('offer_rejected');
    case 'expired':
      return toDriver('offer_expired');
    case 'request_cancelled':
      return toDriver('trip_cancelled', CUSTOMER_CANCELLED_BODY);
    case 'withdrawn':
      return null;
  }
}

/** Offers and nearby requests share a key per request, trips and payments another. */
function collapseKeyOf({ kind, requestId }: PushData): string {
  return kind === 'nearby_request' || kind.startsWith('offer_')
    ? `offer:${requestId}`
    : `trip:${requestId}`;
}

/**
 * Sends the pushes for what just changed in a trip, to people who are not looking at the app.
 *
 * Called by {@link TripEvents} from the same after-commit points as the `/ws` events, with the
 * ids that changed and the event that changed them. The push is built from that event, not
 * from the row's state at send time (which may be a later event's); only the recipients are
 * read back, so a push never says more than they may see over REST. Nobody with a live `/ws` socket is
 * pushed (they already saw the event), and each person only gets pushes on the tokens of the
 * app the event is for. Best effort and fire-and-forget: the callers do not wait for the
 * provider, and a failure is logged and never fails them.
 */
@Injectable()
export class NotificationsService implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly pending = new Set<Promise<void>>();
  private tail: Promise<void> = Promise.resolve();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly tokens: DeviceTokens,
    private readonly realtime: RealtimeService,
  ) {}

  /** What just happened to these requests (see {@link RequestEvent}); only the people to tell are read. */
  requestsChanged(ids: string[], event?: RequestEvent): void {
    if (!event) return;
    this.dispatch('request', async () => {
      if (ids.length === 0) return;
      const rows = await this.db
        .select({
          id: towRequests.id,
          customerId: towRequests.customerId,
          driverId: towRequests.assignedDriverId,
        })
        .from(towRequests)
        .where(inArray(towRequests.id, ids));
      for (const row of rows) await this.deliver(requestPush(row.id, event, row));
    });
  }

  /** What just happened to these offers (see {@link OfferEvent}); only the people to tell are read. */
  offersChanged(ids: string[], event: OfferEvent): void {
    if (event === 'withdrawn') return;
    this.dispatch('offer', async () => {
      if (ids.length === 0) return;
      const rows = await this.db
        .select({
          id: towOffers.id,
          requestId: towOffers.requestId,
          driverId: towOffers.driverId,
          customerId: towRequests.customerId,
        })
        .from(towOffers)
        .innerJoin(towRequests, eq(towRequests.id, towOffers.requestId))
        .where(inArray(towOffers.id, ids));
      for (const row of rows) await this.deliver(offerPush(row.id, event, row));
    });
  }

  /** Online drivers in range of the requests that are open: the reverse of the nearby list. */
  requestsOpened(ids: string[]): void {
    this.dispatch('nearby request', async () => {
      if (ids.length === 0) return;
      const now = this.now();
      const open = await this.db
        .select({ id: towRequests.id })
        .from(towRequests)
        .where(
          and(
            inArray(towRequests.id, ids),
            eq(towRequests.status, 'open'),
            gt(towRequests.expiresAt, now),
          ),
        );
      const drivers = await driversNearRequests(
        this.db,
        now,
        open.map((request) => request.id),
      );
      for (const { userId, requestId } of drivers) {
        await this.deliver({
          userId,
          appVariant: 'driver',
          data: { kind: 'nearby_request', requestId },
        });
      }
    });
  }

  private async deliver(push: Push | null): Promise<void> {
    if (!push || this.realtime.isConnected(push.userId)) return;
    const tokens = await this.tokens.forUser(push.userId, push.appVariant);
    if (tokens.length === 0) return;
    const message = PUSH_MESSAGES[push.data.kind];
    try {
      await this.sender.send(tokens, {
        title: message.title,
        body: push.body ?? message.body,
        data: push.data,
        collapseKey: collapseKeyOf(push.data),
      });
    } catch (error) {
      this.logger.warn(`Could not send ${push.data.kind}: ${(error as Error).message}`);
    }
  }

  /** Resolves once every push started so far has been sent or has failed. For tests and shutdown. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  /** On shutdown, lets the pushes on their way go out, for at most {@link SHUTDOWN_FLUSH_MS}. */
  async onApplicationShutdown(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const cap = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SHUTDOWN_FLUSH_MS);
    });
    try {
      await Promise.race([this.flush(), cap]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Starts `run` without waiting for it: a slow provider must not slow the request. Jobs run
   * one after another, in the order they were started, so events reach a device in the order
   * they happened. Errors are logged.
   */
  private dispatch(what: string, run: () => Promise<void>): void {
    const job: Promise<void> = this.tail
      .then(run)
      .catch((error: Error) => {
        this.logger.warn(`Could not push ${what} changes: ${error.message}`);
      })
      .finally(() => this.pending.delete(job));
    this.tail = job;
    this.pending.add(job);
  }
}
