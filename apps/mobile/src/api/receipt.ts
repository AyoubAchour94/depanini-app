import { receiptSchema } from '@depanini/shared';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './client';

export const receiptKey = (requestId: string) => ['receipt', requestId] as const;

/**
 * `GET /tow-requests/:id/receipt`, for the customer or the assigned driver of a
 * completed request. Fails with an `ApiError`: 404 for anyone else or before
 * the trip is completed.
 */
export function useReceipt(requestId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: receiptKey(requestId),
    queryFn: ({ signal }) =>
      apiRequest(`/tow-requests/${requestId}/receipt`, receiptSchema, { signal }),
    enabled,
    // A receipt never changes once issued.
    staleTime: Infinity,
  });
}
