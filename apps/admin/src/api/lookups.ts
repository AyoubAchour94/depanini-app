import {
  adminDisputeItemSchema,
  adminDisputePageSchema,
  adminReportPageSchema,
  adminReportSchema,
  adminTripDetailSchema,
  adminTripPageSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  auditPageSchema,
  type ReportStatus,
  type ResolveInput,
  type TowRequestStatus,
} from '@depanini/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApi } from './ApiProvider';

const PAGE_SIZE = 25;

type Params = Record<string, string | undefined>;

/** `?a=1&b=2` from the params that are set. */
function queryString(params: Params, extra: Params = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...extra })) {
    if (value) search.set(key, value);
  }
  return search.toString();
}

/** A cursor-paginated list: `path` with `params`, loaded page by page. */
function usePagedList<S extends z.ZodType<{ items: unknown[]; nextCursor: string | null }>>(
  key: readonly unknown[],
  path: string,
  params: Params,
  schema: S,
) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...key, params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get(
        `${path}?${queryString(params, { limit: String(PAGE_SIZE), cursor: pageParam })}`,
        schema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Query keys of the lookups and queues; the one place to invalidate from. */
export const lookupKeys = {
  users: ['users'] as const,
  trips: ['trips'] as const,
  reports: ['reports'] as const,
  disputes: ['disputes'] as const,
  audit: ['audit'] as const,
};

/** Accounts whose email or phone starts with `q`; all of them when `q` is empty. */
export function useUsers(q: string) {
  return usePagedList([...lookupKeys.users, 'list'], '/admin/users', { q }, adminUserPageSchema);
}

export function useUser(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...lookupKeys.users, 'detail', id],
    queryFn: () => api.get(`/admin/users/${id}`, adminUserDetailSchema),
  });
}

export interface TripFilters {
  q: string;
  status?: TowRequestStatus;
  /** `YYYY-MM-DD`, both ends included. */
  from?: string;
  to?: string;
}

export function useTrips({ q, status, from, to }: TripFilters) {
  return usePagedList(
    [...lookupKeys.trips, 'list'],
    '/admin/trips',
    { q, status, from, to },
    adminTripPageSchema,
  );
}

export function useTrip(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...lookupKeys.trips, 'detail', id],
    queryFn: () => api.get(`/admin/trips/${id}`, adminTripDetailSchema),
  });
}

export function useReports(status: ReportStatus | undefined) {
  return usePagedList([...lookupKeys.reports], '/admin/reports', { status }, adminReportPageSchema);
}

export function useDisputes(status: ReportStatus | undefined) {
  return usePagedList(
    [...lookupKeys.disputes],
    '/admin/disputes',
    { status },
    adminDisputePageSchema,
  );
}

export function useAudit() {
  return usePagedList([...lookupKeys.audit], '/admin/audit', {}, auditPageSchema);
}

/** After a resolution: the queues, the trips (their detail shows it) and the audit log. */
function useRefreshAfterResolve() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [lookupKeys.reports, lookupKeys.disputes, lookupKeys.trips, lookupKeys.audit].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useResolveReport(id: string) {
  const api = useApi();
  const refresh = useRefreshAfterResolve();
  return useMutation({
    mutationFn: (input: ResolveInput) =>
      api.post(`/admin/reports/${id}/resolve`, input, adminReportSchema),
    onSuccess: refresh,
  });
}

/** Disputes are resolved by the trip's id. */
export function useResolveDispute(requestId: string) {
  const api = useApi();
  const refresh = useRefreshAfterResolve();
  return useMutation({
    mutationFn: (input: ResolveInput) =>
      api.post(`/admin/disputes/${requestId}/resolve`, input, adminDisputeItemSchema),
    onSuccess: refresh,
  });
}
