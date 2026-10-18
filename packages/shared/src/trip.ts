import { z } from 'zod';

import { estimateRoadDistanceM, etaMinutes } from './fare';
import type { LatLng } from './geo';
import { TRIP_STAGES, type TowRequestStatus, type TripStage } from './tow-request';

/** Why a customer cancels an assigned request the driver has already reached. */
export const CUSTOMER_CANCEL_REASONS = [
  'driver_late',
  'problem_solved',
  'found_other_help',
  'other',
] as const;

export const customerCancelReasonSchema = z.enum(CUSTOMER_CANCEL_REASONS);

export type CustomerCancelReason = z.infer<typeof customerCancelReasonSchema>;

/** Why a driver cancels an assigned request. */
export const DRIVER_CANCEL_REASONS = [
  'vehicle_not_there',
  'customer_unreachable',
  'unsafe',
  'truck_problem',
  'other',
] as const;

export const driverCancelReasonSchema = z.enum(DRIVER_CANCEL_REASONS);

export type DriverCancelReason = z.infer<typeof driverCancelReasonSchema>;

/**
 * Body of `POST /tow-requests/:id/cancel`. The reason is optional because a
 * free cancel needs none; the API checks it against {@link canCustomerCancel}
 * or {@link canDriverCancel} and against the caller's own reason list.
 */
export const cancelInputSchema = z.object({
  reason: z.union([customerCancelReasonSchema, driverCancelReasonSchema]).optional(),
});

export type CancelInput = z.input<typeof cancelInputSchema>;

/** Body of `POST /driver/job/stage`. Every job starts at `accepted`, so it is not a target. */
export const jobStageInputSchema = z.object({
  stage: z.enum(['en_route', 'arrived', 'towing']),
});

export type JobStageInput = z.input<typeof jobStageInputSchema>;

/** The stage after `stage`, or `null` after `towing` (dropping off completes the request). */
export function nextTripStage(stage: TripStage): TripStage | null {
  return TRIP_STAGES[TRIP_STAGES.indexOf(stage) + 1] ?? null;
}

/** Whether cancelling is free, needs a reason, or is not allowed. */
export type CancelRule = 'free' | 'with_reason' | 'no';

interface Cancellable {
  status: TowRequestStatus;
  tripStage?: TripStage | null;
}

/**
 * What a customer needs to cancel: free while open or before the driver has
 * arrived, a reason once arrived, never once towing or finished. An assigned
 * request without a stage (assigned before trips existed) counts as `accepted`.
 */
export function canCustomerCancel(request: Cancellable): CancelRule {
  if (request.status === 'open') return 'free';
  if (request.status !== 'assigned') return 'no';
  const stage = request.tripStage ?? 'accepted';
  if (stage === 'arrived') return 'with_reason';
  if (stage === 'towing') return 'no';
  return 'free';
}

/** What a driver needs to cancel: always a reason, until towing starts. */
export function canDriverCancel(job: Cancellable): Exclude<CancelRule, 'free'> {
  if (job.status !== 'assigned') return 'no';
  return job.tripStage === 'towing' ? 'no' : 'with_reason';
}

/** Minutes to drive from `from` to `target`: estimated road distance at the driver's speed. */
export function etaTo(target: LatLng, from: LatLng): number {
  return etaMinutes(estimateRoadDistanceM(from, target));
}
