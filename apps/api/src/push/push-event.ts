import type { CancelledBy, TripStage } from '@depanini/shared';

/**
 * What happened to a request, captured by the service that made the change, at commit time.
 * The push says this, whatever state the row is in by the time it is sent: two quick stage
 * changes are two pushes, not one push about the later stage twice.
 */
export type RequestEvent =
  | { type: 'stage'; stage: Exclude<TripStage, 'accepted'> }
  | { type: 'completed' }
  | { type: 'payment_answered' }
  | { type: 'cancelled'; cancelledBy: CancelledBy };

/**
 * What happened to an offer. `received` is for the customer, the rest for the offer's driver.
 * `request_cancelled` is the customer cancelling the request the offer was pending on, which
 * is not the same news as `rejected` (they went with another offer). `withdrawn` (the
 * driver's own doing, or an accept elsewhere) is never pushed.
 */
export type OfferEvent =
  'received' | 'accepted' | 'rejected' | 'declined' | 'expired' | 'withdrawn' | 'request_cancelled';
