import {
  type FareEstimate,
  type FareEstimateInput,
  fareEstimateSchema,
  type TowRequest,
  type TowRequestInput,
  towRequestSchema,
} from '@depanini/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { apiRequest } from './client';

/** `POST /tow-requests/estimate`: the distance and the fare bounds for a trip. */
export function estimateFare(input: FareEstimateInput): Promise<FareEstimate> {
  return apiRequest('/tow-requests/estimate', fareEstimateSchema, { method: 'POST', json: input });
}

/** The estimate for a trip; refetched when the pickup, drop-off or vehicle type changes. */
export function useFareEstimate(input: FareEstimateInput | null) {
  return useQuery({
    queryKey: ['tow-requests', 'estimate', input],
    queryFn: () => estimateFare(input!),
    enabled: input !== null,
    staleTime: 60_000,
  });
}

/**
 * `POST /tow-requests`. Fails with an `ApiError`: 403 without a customer
 * profile, 409 when the customer already has an open request, 400 for a fare
 * outside the bounds.
 */
export function useCreateTowRequest() {
  return useMutation({
    mutationFn: (input: TowRequestInput): Promise<TowRequest> =>
      apiRequest('/tow-requests', towRequestSchema, { method: 'POST', json: input }),
  });
}
