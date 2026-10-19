import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CancelledBy, OfferStatus, PushData, PushKind, TripStage } from '@depanini/shared';
import { and, eq, gt, inArray } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { payments, towOffers, towRequests } from '../db/schema.js';
import { driversNearRequests } from '../realtime/nearby-drivers.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { type AppVariant, DeviceTokens } from './device-tokens.service.js';
import { PUSH_MESSAGES, TRIP_STAGE_BODIES } from './messages.js';
import { PUSH_SENDER, type PushSender } from './push-sender.js';

/** One push to one person: which app gets it, and what it says. */
export interface Push {
  userId: string;
  appVariant: AppVariant;
  data: PushData;
}

export interface RequestState {
  id: string;
  status: string;
  tripStage: TripStage | null;
  cancelledBy: CancelledBy | null;
  customerId: string;
  driverId: string | null;
  /** When the customer answered the payment; null while unanswered (or without a payment). */
  paymentAnsweredAt: Date | null;
}

export interface OfferState {
  id: string;
  requestId: string;
  status: OfferStatus;
  driverId: string;
  customerId: string;
}

/** The push a request's current state calls for, if any. Customers hear `user`, drivers `driver`. */
export function requestPush(request: RequestState): Push | null {
  const { id: requestId, customerId, driverId } = request;
  const toCustomer = (kind: PushKind): Push => ({
    userId: customerId,
    appVariant: 'user',
    data: { kind, requestId },
  });
  const toDriver = (kind: PushKind): Push | null =>
    driverId ? { userId: driverId, appVariant: 'driver', data: { kind, requestId } } : null;

  switch (request.status) {
    case 'assigned':
      // `accepted` is the customer's own tap, and the driver was told by the offer push.
      return request.tripStage && request.tripStage !== 'accepted'
        ? toCustomer('trip_stage')
        : null;
    case 'completed':
      return request.paymentAnsweredAt
        ? toDriver('payment_answered')
        : toCustomer('trip_completed');
    case 'cancelled':
      // Cancelled while open has no driver to tell.
      if (request.cancelledBy === 'customer') return toDriver('trip_cancelled');
      return request.cancelledBy === 'driver' ? toCustomer('trip_cancelled') : null;
    default:
      return null;
  }
}

/** The push an offer's current state calls for, if any. */
export function offerPush(offer: OfferState): Push | null {
  const { id: offerId, requestId } = offer;
  const toDriver = (kind: PushKind): Push => ({
    userId: offer.driverId,
    appVariant: 'driver',
    data: { kind, requestId, offerId },
  });
  switch (offer.status) {
    case 'pending':
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
    default:
      return null; // withdrawn: the driver's own doing
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
 * ids that changed. Like it, it reads the rows back and decides from their state, so a push
 * never says more than the recipient may see over REST. Nobody with a live `/ws` socket is
 * pushed (they already saw the event), and each person only gets pushes on the tokens of the
 * app the event is for. Best effort: a failure is logged and never fails the caller.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly tokens: DeviceTokens,
    private readonly realtime: RealtimeService,
  ) {}

  /** Trip stages, cancellations, completion and payment answers: from the requests' state. */
  async requestsChanged(ids: string[]): Promise<void> {
    await this.bestEffort('request', async () => {
      if (ids.length === 0) return;
      const rows = await this.db
        .select({
          id: towRequests.id,
          status: towRequests.status,
          tripStage: towRequests.tripStage,
          cancelledBy: towRequests.cancelledBy,
          customerId: towRequests.customerId,
          driverId: towRequests.assignedDriverId,
          paymentAnsweredAt: payments.customerAnsweredAt,
        })
        .from(towRequests)
        .leftJoin(payments, eq(payments.requestId, towRequests.id))
        .where(inArray(towRequests.id, ids));
      for (const row of rows) await this.deliver(requestPush(row), row.tripStage);
    });
  }

  /** Offers received, accepted, rejected and expired: from the offers' state. */
  async offersChanged(ids: string[]): Promise<void> {
    await this.bestEffort('offer', async () => {
      if (ids.length === 0) return;
      const rows = await this.db
        .select({
          id: towOffers.id,
          requestId: towOffers.requestId,
          status: towOffers.status,
          driverId: towOffers.driverId,
          customerId: towRequests.customerId,
        })
        .from(towOffers)
        .innerJoin(towRequests, eq(towRequests.id, towOffers.requestId))
        .where(inArray(towOffers.id, ids));
      for (const row of rows) await this.deliver(offerPush(row));
    });
  }

  /** Online drivers in range of the requests that are open: the reverse of the nearby list. */
  async requestsOpened(ids: string[]): Promise<void> {
    await this.bestEffort('nearby request', async () => {
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

  private async deliver(push: Push | null, tripStage?: TripStage | null): Promise<void> {
    if (!push || this.realtime.isConnected(push.userId)) return;
    const tokens = await this.tokens.forUser(push.userId, push.appVariant);
    if (tokens.length === 0) return;
    const message = PUSH_MESSAGES[push.data.kind];
    const body =
      push.data.kind === 'trip_stage' && tripStage && tripStage !== 'accepted'
        ? TRIP_STAGE_BODIES[tripStage]
        : message.body;
    try {
      await this.sender.send(tokens, {
        title: message.title,
        body,
        data: push.data,
        collapseKey: collapseKeyOf(push.data),
      });
    } catch (error) {
      this.logger.warn(`Could not send ${push.data.kind}: ${(error as Error).message}`);
    }
  }

  private async bestEffort(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.warn(`Could not push ${what} changes: ${(error as Error).message}`);
    }
  }
}
