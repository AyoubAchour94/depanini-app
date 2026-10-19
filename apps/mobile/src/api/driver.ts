import {
  type DriverJob,
  type DriverCancelReason,
  driverJobSchema,
  type DriverPresence,
  type DriverPresenceInput,
  driverPresenceSchema,
  type NearbyRequest,
  nearbyRequestSchema,
  type Offer,
  offerSchema,
  type TowRequest,
  towRequestSchema,
  type TripStage,
} from '@depanini/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { usePollMs } from '@/realtime/status';

import { apiRequest } from './client';

/** `PUT /driver/presence`. Fails with an `ApiError`: 403 without a driver profile. */
export function putPresence(input: DriverPresenceInput): Promise<DriverPresence> {
  return apiRequest('/driver/presence', driverPresenceSchema, { method: 'PUT', json: input });
}

/** How often the nearby list is re-read while it is showing. */
export const NEARBY_POLL_MS = 10_000;

export const NEARBY_KEY = ['driver', 'requests', 'nearby'] as const;

const fetchNearby = () => apiRequest('/driver/requests/nearby', z.array(nearbyRequestSchema));

/**
 * `GET /driver/requests/nearby`: open requests around the driver, nearest
 * first. Only fetches while `enabled` (the driver is online) and polls while
 * `poll` is set (the screen is focused).
 */
export function useNearbyRequests({ enabled, poll }: { enabled: boolean; poll: boolean }) {
  const pollMs = usePollMs(NEARBY_POLL_MS);
  return useQuery({
    queryKey: NEARBY_KEY,
    queryFn: fetchNearby,
    enabled,
    refetchInterval: enabled && poll ? pollMs : false,
  });
}

/**
 * One request from the nearby list already in the cache, for the details
 * screen. Never fetches: `undefined` when the list does not hold it (any more).
 */
export function useCachedNearbyRequest(id: string): NearbyRequest | undefined {
  const { data } = useQuery({ queryKey: NEARBY_KEY, queryFn: fetchNearby, enabled: false });
  return data?.find((request) => request.id === id);
}

export const OFFERS_KEY = ['driver', 'offers', 'active'] as const;
export const JOB_KEY = ['driver', 'job'] as const;

/** How often the driver's offers are re-read while the offer screen is showing. */
export const OFFERS_POLL_MS = 5_000;

/** How often the driver's job is re-read while the home or job screen is showing. */
export const JOB_POLL_MS = 10_000;

/**
 * `GET /driver/offers/active`: the driver's offers of the last hour, newest
 * first, with their current status.
 */
export function useActiveOffers({ poll }: { poll: boolean }) {
  const pollMs = usePollMs(OFFERS_POLL_MS);
  return useQuery({
    queryKey: OFFERS_KEY,
    queryFn: () => apiRequest('/driver/offers/active', z.array(offerSchema)),
    refetchInterval: poll ? pollMs : false,
  });
}

/** `GET /driver/job`: the driver's assigned request, or `null` (204) when there is none. */
export function useDriverJob({ poll }: { poll: boolean }) {
  const pollMs = usePollMs(JOB_POLL_MS);
  return useQuery({
    queryKey: JOB_KEY,
    queryFn: async (): Promise<DriverJob | null> =>
      (await apiRequest('/driver/job', driverJobSchema.optional())) ?? null,
    refetchInterval: poll ? pollMs : false,
  });
}

/** Offers, the nearby list and the job all change with every offer or job action. */
function useInvalidateDriverQueries() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: NEARBY_KEY }),
      queryClient.invalidateQueries({ queryKey: OFFERS_KEY }),
      queryClient.invalidateQueries({ queryKey: JOB_KEY }),
    ]);
}

/**
 * `POST /tow-requests/:id/offers`. Fails with an `ApiError`: 409 when the
 * driver cannot offer (offline, out of range, has a job or a pending offer, or
 * the request is closed), 404 for an unknown request, 400 for a fare outside
 * the bounds.
 */
export function useSendOffer(requestId: string) {
  const invalidate = useInvalidateDriverQueries();
  return useMutation({
    mutationFn: (fare: number): Promise<Offer> =>
      apiRequest(`/tow-requests/${requestId}/offers`, offerSchema, {
        method: 'POST',
        json: { fare },
      }),
    onSettled: invalidate,
  });
}

/** `POST /offers/:id/withdraw`. Fails with 404 when it is not the driver's, 409 when not pending. */
export function useWithdrawOffer() {
  const invalidate = useInvalidateDriverQueries();
  return useMutation({
    mutationFn: (offerId: string): Promise<Offer> =>
      apiRequest(`/offers/${offerId}/withdraw`, offerSchema, { method: 'POST' }),
    onSettled: invalidate,
  });
}

/**
 * `POST /tow-requests/:id/cancel` as the assigned driver, with the required
 * reason. Fails with 400 for a missing or unknown reason, 409 once towing.
 */
export function useCancelJob() {
  const invalidate = useInvalidateDriverQueries();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: DriverCancelReason }) =>
      apiRequest(`/tow-requests/${requestId}/cancel`, towRequestSchema, {
        method: 'POST',
        json: { reason },
      }),
    onSettled: invalidate,
  });
}

/**
 * `POST /driver/job/stage`: moves the job to its next stage. Fails with 409
 * when the stage is out of order (the job moved on), 404 without a job.
 */
export function useAdvanceJob() {
  const invalidate = useInvalidateDriverQueries();
  return useMutation({
    mutationFn: (stage: Exclude<TripStage, 'accepted'>): Promise<DriverJob> =>
      apiRequest('/driver/job/stage', driverJobSchema, { method: 'POST', json: { stage } }),
    onSettled: invalidate,
  });
}

/** `POST /driver/job/complete`: drops the vehicle off. Fails with 409 unless the job is `towing`. */
export function useCompleteJob() {
  const invalidate = useInvalidateDriverQueries();
  return useMutation({
    mutationFn: (): Promise<TowRequest> =>
      apiRequest('/driver/job/complete', towRequestSchema, {
        method: 'POST',
        json: { cashReceived: true },
      }),
    onSettled: invalidate,
  });
}
