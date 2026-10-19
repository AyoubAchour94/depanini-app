import { z } from 'zod';

import { truckTypeSchema } from './account';
import { isInTunisia } from './geo';
import { paymentSummarySchema } from './payment';
import { latLngSchema } from './presence';

/** The kinds of vehicle a customer can have towed. */
export const VEHICLE_TYPES = ['car', 'suv_van', 'motorcycle'] as const;

export const vehicleTypeSchema = z.enum(VEHICLE_TYPES, 'Choose your vehicle type');

export type VehicleType = z.infer<typeof vehicleTypeSchema>;

/** What went wrong with the vehicle. */
export const PROBLEM_TYPES = [
  'breakdown',
  'accident',
  'flat_tire',
  'battery',
  'out_of_fuel',
  'stuck',
  'other',
] as const;

export const problemTypeSchema = z.enum(PROBLEM_TYPES, 'Choose the problem');

export type ProblemType = z.infer<typeof problemTypeSchema>;

/** The states of a tow request. Progress within `assigned` is the {@link TRIP_STAGES}. */
export const TOW_REQUEST_STATUSES = [
  'open',
  'assigned',
  'completed',
  'cancelled',
  'expired',
] as const;

export const towRequestStatusSchema = z.enum(TOW_REQUEST_STATUSES);

export type TowRequestStatus = z.infer<typeof towRequestStatusSchema>;

/** The steps of an assigned request, in order. Dropping off sets the status to `completed`. */
export const TRIP_STAGES = ['accepted', 'en_route', 'arrived', 'towing'] as const;

export const tripStageSchema = z.enum(TRIP_STAGES);

export type TripStage = z.infer<typeof tripStageSchema>;

/** Who cancelled an assigned request. */
export const CANCELLED_BY = ['customer', 'driver'] as const;

export const cancelledBySchema = z.enum(CANCELLED_BY);

export type CancelledBy = z.infer<typeof cancelledBySchema>;

/**
 * A pickup or drop-off. The coordinates are the source of truth and must be
 * inside Tunisia; the address is only for display.
 */
export const placeSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().trim().min(1, 'Enter an address').max(200, 'Address is too long'),
  })
  .refine(isInTunisia, { message: 'Choose a place in Tunisia', path: ['latitude'] });

export type Place = z.infer<typeof placeSchema>;

/** Body of `POST /tow-requests/estimate`. */
export const fareEstimateInputSchema = z.object({
  pickup: placeSchema,
  dropoff: placeSchema,
  vehicleType: vehicleTypeSchema,
});

export type FareEstimateInput = z.input<typeof fareEstimateInputSchema>;

/** Response of `POST /tow-requests/estimate`. Fares are whole dinars. */
export const fareEstimateSchema = z.object({
  /** Estimated road distance in metres. */
  distanceM: z.number().int().nonnegative(),
  suggestedFare: z.number().int().positive(),
  minFare: z.number().int().positive(),
  maxFare: z.number().int().positive(),
});

export type FareEstimate = z.infer<typeof fareEstimateSchema>;

/**
 * Body of `POST /tow-requests`. The API recomputes the suggested fare and
 * checks `proposedFare` against its bounds; it never trusts a client price.
 */
export const towRequestInputSchema = z.object({
  pickup: placeSchema,
  dropoff: placeSchema,
  vehicleType: vehicleTypeSchema,
  problemType: problemTypeSchema,
  /** Trimmed; an empty note becomes `undefined`. */
  note: z
    .string()
    .trim()
    .max(280, 'Note is too long')
    .transform((note) => note || undefined)
    .optional(),
  /** Whole dinars. */
  proposedFare: z.number().int('Enter a whole number of dinars').positive('Enter a fare'),
});

export type TowRequestInput = z.input<typeof towRequestInputSchema>;

/** A tow request, as the API returns it. Dates are ISO strings. */
export const towRequestSchema = z.object({
  id: z.uuid(),
  status: towRequestStatusSchema,
  pickup: placeSchema,
  dropoff: placeSchema,
  vehicleType: vehicleTypeSchema,
  problemType: problemTypeSchema,
  note: z.string().nullish(),
  distanceM: z.number().int().nonnegative(),
  suggestedFare: z.number().int().positive(),
  proposedFare: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /** Whole dinars; set once the request is assigned. */
  agreedFare: z.number().int().positive().nullish(),
  assignedAt: z.iso.datetime().nullish(),
  /**
   * The assigned driver. The phone and plate are only for an assigned request; on a
   * completed one (kept for the summary) they are null.
   */
  driver: z
    .object({
      fullName: z.string(),
      phone: z.string().nullish(),
      truckType: truckTypeSchema,
      plateNumber: z.string().nullish(),
    })
    .nullish(),
  /** Where the assigned request is in the trip; null for requests assigned before trips existed. */
  tripStage: tripStageSchema.nullish(),
  enRouteAt: z.iso.datetime().nullish(),
  arrivedAt: z.iso.datetime().nullish(),
  towingAt: z.iso.datetime().nullish(),
  completedAt: z.iso.datetime().nullish(),
  cancelledBy: cancelledBySchema.nullish(),
  cancelReason: z.string().nullish(),
  /** The driver's last known position, for the customer while the request is assigned. */
  driverLocation: latLngSchema.and(z.object({ updatedAt: z.iso.datetime() })).nullish(),
  /** Minutes until the truck reaches the pickup (before `arrived`) or the drop-off (`towing`). */
  etaMin: z.number().int().positive().nullish(),
  /** The cash payment, once the driver has completed the trip. */
  payment: paymentSummarySchema.nullish(),
});

export type TowRequest = z.infer<typeof towRequestSchema>;

/** Response of `GET /tow-requests`: a page of history, newest first. */
export const towRequestPageSchema = z.object({
  items: z.array(towRequestSchema),
  /** Pass back to get the next page; `null` on the last one. */
  nextCursor: z.string().nullable(),
});

export type TowRequestPage = z.infer<typeof towRequestPageSchema>;
