import {
  type DriverJob,
  driverJobSchema,
  type DriverPresence,
  type DriverPresenceInput,
  driverPresenceSchema,
  type NearbyRequest,
  nearbyRequestSchema,
  type Offer,
  offerSchema,
  towRequestSchema,
} from '@depanini/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

/** `PUT /driver/presence`. Fails with an `ApiError`: 403 without a driver profile. */
export function putPresence(input: DriverPresenceInput): Promise<DriverPresence> {
  return apiRequest('/driver/presence', driverPresenceSchema, { method: 'PUT', json: input });
}

/** How often the nearby list is re-read while it is showing. */
export const NEARBY_POLL_MS = 10_000;

const NEARBY_KEY = ['driver', 'requests', 'nearby'] as const;

const fetchNearby = () => apiRequest('/driver/requests/nearby', z.array(nearbyRequestSchema));

/**
 * `GET /driver/requests/nearby`: open requests around the driver, nearest
 * first. Only fetches while `enabled` (the driver is online) and polls while
 * `poll` is set (the screen is focused).
 */
export function useNearbyRequests({ enabled, poll }: { enabled: boolean; poll: boolean }) {
  return useQuery({
    queryKey: NEARBY_KEY,
    queryFn: fetchNearby,
    enabled,
    refetchInterval: enabled && poll ? NEARBY_POLL_MS : false,
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

const OFFERS_KEY = ['driver', 'offers', 'active'] as const;
const JOB_KEY = ['driver', 'job'] as const;

/** How often the driver's offers are re-read while the offer screen is showing. */
export const OFFERS_POLL_MS = 5_000;

/** How often the driver's job is re-read while the home or job screen is showing. */
export const JOB_POLL_MS = 10_000;

/**
 * `GET /driver/offers/active`: the driver's offers of the last hour, newest
 * first, with their current status.
 */
export function useActiveOffers({ poll }: { poll: boolean }) {
  return useQuery({
    queryKey: OFFERS_KEY,
    queryFn: () => apiRequest('/driver/offers/active', z.array(offerSchema)),
    refetchInterval: poll ? OFFERS_POLL_MS : false,
  });
}

/** `GET /driver/job`: the driver's assigned request, or `null` (204) when there is none. */
export function useDriverJob({ poll }: { poll: boolean }) {
  return useQuery({
    queryKey: JOB_KEY,
    queryFn: async (): Promise<DriverJob | null> =>
      (await apiRequest('/driver/job', driverJobSchema.optional())) ?? null,
    refetchInterval: poll ? JOB_POLL_MS : false,
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

/** `POST /tow-requests/:id/cancel` as the assigned driver. */
export function useCancelJob() {
  const invalidate = useInvalidateDriverQueries();
  return useMutation({
    mutationFn: (requestId: string) =>
      apiRequest(`/tow-requests/${requestId}/cancel`, towRequestSchema, { method: 'POST' }),
    onSettled: invalidate,
  });
}
