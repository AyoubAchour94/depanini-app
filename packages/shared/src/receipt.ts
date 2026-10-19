import { z } from 'zod';

import { truckTypeSchema } from './account';
import { paymentMethodSchema, receiptNoSchema } from './payment';
import { placeSchema, problemTypeSchema, vehicleTypeSchema } from './tow-request';

/**
 * Response of `GET /tow-requests/:id/receipt`, for either party of a completed
 * request. It never carries a phone or a plate; unknown keys are stripped on parse.
 */
export const receiptSchema = z.object({
  receiptNo: receiptNoSchema,
  completedAt: z.iso.datetime(),
  pickup: placeSchema,
  dropoff: placeSchema,
  distanceM: z.number().int().nonnegative(),
  vehicleType: vehicleTypeSchema,
  problemType: problemTypeSchema,
  /** Whole dinars. */
  agreedFare: z.number().int().positive(),
  method: paymentMethodSchema,
  /** Stage times; null or absent for trips from before stages were timestamped. */
  assignedAt: z.iso.datetime().nullish(),
  enRouteAt: z.iso.datetime().nullish(),
  arrivedAt: z.iso.datetime().nullish(),
  towingAt: z.iso.datetime().nullish(),
  driver: z.object({ fullName: z.string(), truckType: truckTypeSchema }),
  customer: z.object({ fullName: z.string() }),
});

export type Receipt = z.infer<typeof receiptSchema>;
