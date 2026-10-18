import { z } from 'zod';

import { truckTypeSchema } from './account';

/** The states of an offer. Only `pending` can still change. */
export const OFFER_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'declined',
  'withdrawn',
  'expired',
] as const;

export const offerStatusSchema = z.enum(OFFER_STATUSES);

export type OfferStatus = z.infer<typeof offerStatusSchema>;

/**
 * Body of `POST /tow-requests/:id/offers`. The API checks the fare against the
 * request's bounds; the customer's proposed fare is an accept, any other a counter.
 */
export const offerInputSchema = z.object({
  /** Whole dinars. */
  fare: z.number().int('Enter a whole number of dinars').positive('Enter a fare'),
});

export type OfferInput = z.input<typeof offerInputSchema>;

/** An offer, as its driver sees it. Dates are ISO strings. */
export const offerSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  fare: z.number().int().positive(),
  etaMin: z.number().int().positive(),
  distanceToPickupM: z.number().int().nonnegative(),
  status: offerStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type Offer = z.infer<typeof offerSchema>;

/** An offer, as the customer sees it: the offer plus who made it. */
export const customerOfferSchema = offerSchema.extend({
  driver: z.object({
    fullName: z.string(),
    truckType: truckTypeSchema,
  }),
});

export type CustomerOffer = z.infer<typeof customerOfferSchema>;
