import type { PushData } from '@depanini/shared';
import type { Href } from 'expo-router';

/** What the app knows when a push is tapped. */
export interface PushRouteContext {
  isDriverApp: boolean;
  /** The request is in the driver's cached nearby list (so the details screen can open). */
  hasNearbyRequest: (requestId: string) => boolean;
  /** The driver has an assigned job. */
  hasJob: boolean;
}

/** `?notice=` on the driver home after a customer cancelled a request the driver had offered on. */
export const REQUEST_CANCELLED_NOTICE = 'request-cancelled';

/**
 * The screen a tapped push opens, or null when this app has none for it
 * (a push meant for the other app, which the API normally never sends).
 */
export function pushRoute(data: PushData, context: PushRouteContext): Href | null {
  return context.isDriverApp ? driverRoute(data, context) : customerRoute(data);
}

function customerRoute({ kind }: PushData): Href | null {
  switch (kind) {
    case 'offer_received':
    case 'trip_stage':
    case 'trip_cancelled':
    // The active screen shows the completed summary when the trip is done.
    case 'trip_completed':
      return '/request/active';
    default:
      return null;
  }
}

function driverRoute(data: PushData, context: PushRouteContext): Href | null {
  switch (data.kind) {
    case 'verification_approved':
    case 'verification_rejected':
      // The screen arrives with the driver verification slice; typed routes don't know it yet.
      return '/verification' as Href;
    case 'nearby_request':
      return data.requestId && context.hasNearbyRequest(data.requestId)
        ? { pathname: '/job-offer/[id]', params: { id: data.requestId } }
        : '/';
    case 'offer_accepted':
      return '/job';
    case 'offer_rejected':
    case 'offer_expired':
      return '/';
    case 'trip_cancelled':
      // An open request cancelled under a pending offer: there is no job to open.
      return data.offerId && !context.hasJob
        ? { pathname: '/', params: { notice: REQUEST_CANCELLED_NOTICE } }
        : '/job';
    case 'payment_answered':
      return data.requestId ? { pathname: '/jobs/[id]', params: { id: data.requestId } } : '/';
    default:
      return null;
  }
}
