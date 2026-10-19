import type { PushKind } from '@depanini/shared';

/**
 * What each push says: short English strings, all in one place. They are localized in
 * Phase 9; until then the apps show them as they come.
 */
export const TRIP_STAGE_BODIES = {
  en_route: 'Your driver is on the way.',
  arrived: 'Your driver has arrived at the pickup.',
  towing: 'Your vehicle is on the truck and on its way.',
} as const;

export const PUSH_MESSAGES: Record<PushKind, { title: string; body: string }> = {
  nearby_request: { title: 'New request nearby', body: 'A customer near you needs a tow.' },
  offer_received: {
    title: 'New offer',
    body: 'A driver made you an offer. Open the app to see it.',
  },
  offer_accepted: { title: 'Offer accepted', body: 'The customer chose you. Head to the pickup.' },
  offer_rejected: { title: 'Offer declined', body: 'The customer went with another offer.' },
  offer_expired: {
    title: 'Offer expired',
    body: 'Your offer ran out before the customer answered.',
  },
  trip_stage: {
    title: 'Your trip has moved on',
    body: 'Open the app to see where your driver is.',
  },
  trip_cancelled: { title: 'Trip cancelled', body: 'The trip was cancelled by the other side.' },
  trip_completed: {
    title: 'Trip completed',
    body: 'You have arrived. Open the app to pay and rate.',
  },
  payment_answered: { title: 'Payment answered', body: 'The customer answered the payment.' },
};
