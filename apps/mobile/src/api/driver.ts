import {
  type DriverPresence,
  type DriverPresenceInput,
  driverPresenceSchema,
  type NearbyRequest,
  nearbyRequestSchema,
} from '@depanini/shared';
import { useQuery } from '@tanstack/react-query';
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
