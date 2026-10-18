import {
  type CustomerCancelReason,
  type CustomerOffer,
  customerOfferSchema,
  type FareEstimate,
  type FareEstimateInput,
  fareEstimateSchema,
  type TowRequest,
  type TowRequestInput,
  towRequestSchema,
} from '@depanini/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { usePollMs } from '@/realtime/status';

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

export const ACTIVE_KEY = ['tow-requests', 'active'] as const;
export const HISTORY_KEY = ['tow-requests', 'history'] as const;

export const OFFERS_KEY = ['tow-requests', 'offers'] as const;

/** Refetches the active request, its offers and the history, which every create, cancel and accept changes. */
function useInvalidateTowRequests() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ACTIVE_KEY }),
      queryClient.invalidateQueries({ queryKey: OFFERS_KEY }),
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
    ]);
}

/**
 * `POST /tow-requests`. Fails with an `ApiError`: 403 without a customer
 * profile, 409 when the customer already has an open request, 400 for a fare
 * outside the bounds.
 */
export function useCreateTowRequest() {
  const invalidate = useInvalidateTowRequests();
  return useMutation({
    mutationFn: (input: TowRequestInput): Promise<TowRequest> =>
      apiRequest('/tow-requests', towRequestSchema, { method: 'POST', json: input }),
    onSettled: () => void invalidate(),
  });
}

/** How often the open request is re-read while its screen is showing. */
export const ACTIVE_POLL_MS = 15_000;
/** Faster while a driver is assigned, for the truck and the ETA; a live socket lowers every poll to 30 s. */
export const ASSIGNED_POLL_MS = 10_000;

/**
 * `GET /tow-requests/active`: the customer's open or assigned request, or `null` (204)
 * when there is none, because it was cancelled elsewhere or expired.
 */
export function useActiveTowRequest({ poll = false }: { poll?: boolean } = {}) {
  const assignedMs = usePollMs(ASSIGNED_POLL_MS);
  const openMs = usePollMs(ACTIVE_POLL_MS);
  return useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: async () =>
      (await apiRequest('/tow-requests/active', towRequestSchema.optional())) ?? null,
    refetchInterval: (query) =>
      poll ? (query.state.data?.status === 'assigned' ? assignedMs : openMs) : false,
  });
}

/**
 * `POST /tow-requests/:id/cancel`, with the reason when the rules ask for one.
 * Fails with an `ApiError`: 400 for a missing or unknown reason, 404 when the
 * request is not the customer's, 409 when it can no longer be cancelled.
 */
export function useCancelTowRequest() {
  const invalidate = useInvalidateTowRequests();
  return useMutation({
    mutationFn: ({
      id,
      reason,
    }: {
      id: string;
      reason?: CustomerCancelReason;
    }): Promise<TowRequest> =>
      apiRequest(`/tow-requests/${id}/cancel`, towRequestSchema, {
        method: 'POST',
        json: reason ? { reason } : undefined,
      }),
    onSettled: () => void invalidate(),
  });
}

/** How often the offers on the open request are re-read while its screen is showing. */
export const OFFERS_POLL_MS = 5_000;

/**
 * `GET /tow-requests/:id/offers`: the pending offers, lowest fare first.
 * Pass `poll` only while the screen is focused and the request is open.
 */
export function useOffers(requestId: string, { poll = false }: { poll?: boolean } = {}) {
  const pollMs = usePollMs(OFFERS_POLL_MS);
  return useQuery({
    queryKey: [...OFFERS_KEY, requestId],
    queryFn: (): Promise<CustomerOffer[]> =>
      apiRequest(`/tow-requests/${requestId}/offers`, z.array(customerOfferSchema)),
    refetchInterval: poll ? pollMs : false,
  });
}

/**
 * `POST /offers/:id/accept`: assigns the driver. Fails with an `ApiError`:
 * 409 when the offer or the request is no longer available.
 */
export function useAcceptOffer() {
  const invalidate = useInvalidateTowRequests();
  return useMutation({
    mutationFn: (id: string): Promise<TowRequest> =>
      apiRequest(`/offers/${id}/accept`, towRequestSchema, { method: 'POST' }),
    onSettled: () => void invalidate(),
  });
}

/** `POST /offers/:id/decline`. */
export function useDeclineOffer() {
  const invalidate = useInvalidateTowRequests();
  return useMutation({
    mutationFn: (id: string): Promise<CustomerOffer> =>
      apiRequest(`/offers/${id}/decline`, customerOfferSchema, { method: 'POST' }),
    onSettled: () => void invalidate(),
  });
}

const rawPageSchema = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });

export interface HistoryPage {
  items: TowRequest[];
  nextCursor: string | null;
}

/**
 * Rows are parsed one by one so a row the app does not understand is skipped
 * and logged instead of hiding the whole list.
 */
export function parseHistoryPage(raw: unknown): HistoryPage {
  const page = rawPageSchema.parse(raw);
  const items: TowRequest[] = [];
  for (const row of page.items) {
    const parsed = towRequestSchema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
    else console.warn('Skipping a tow request the app could not read', parsed.error.issues);
  }
  return { items, nextCursor: page.nextCursor };
}

export const HISTORY_PAGE_SIZE = 20;

/** `GET /tow-requests`: the customer's requests, newest first, a page at a time. */
export function useTowRequestHistory() {
  return useInfiniteQuery({
    queryKey: HISTORY_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
      if (pageParam) query.set('cursor', pageParam);
      return apiRequest(`/tow-requests?${query}`, z.unknown().transform(parseHistoryPage));
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
