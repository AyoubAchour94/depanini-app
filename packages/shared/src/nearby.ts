import { z } from 'zod';

import { offerSchema } from './offer';
import { ratingSummarySchema } from './rating';
import { placeSchema, problemTypeSchema, vehicleTypeSchema } from './tow-request';

/** An open tow request, as a nearby driver sees it. It carries no customer contact. */
export const nearbyRequestSchema = z.object({
  id: z.uuid(),
  pickup: placeSchema,
  dropoff: placeSchema,
  vehicleType: vehicleTypeSchema,
  problemType: problemTypeSchema,
  note: z.string().nullish(),
  /** Estimated road distance of the tow, in metres. */
  distanceM: z.number().int().nonnegative(),
  proposedFare: z.number().int().positive(),
  suggestedFare: z.number().int().positive(),
  minFare: z.number().int().positive(),
  maxFare: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
  /** Estimated road distance from the driver to the pickup, in metres. */
  distanceToPickupM: z.number().int().nonnegative(),
  /** The driver's pending offer on this request, if any. */
  myOffer: offerSchema.nullish(),
  /** Who asked: only their rating, never contact details. Missing in old payloads. */
  customer: z.object({ rating: ratingSummarySchema.nullish() }).nullish(),
});

export type NearbyRequest = z.infer<typeof nearbyRequestSchema>;
