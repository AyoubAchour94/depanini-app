import {
  adminDriverDetailSchema,
  adminDriverPageSchema,
  type ReviewInput,
  type VerificationStatus,
} from '@depanini/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './ApiProvider';

const PAGE_SIZE = 50;

/** Query keys of the driver screens; the one place to invalidate from. */
export const driverKeys = {
  all: ['drivers'] as const,
  list: (status: VerificationStatus | undefined) => ['drivers', 'list', status ?? 'all'] as const,
  detail: (userId: string) => ['drivers', 'detail', userId] as const,
};

/** Drivers of one status (or all), loaded page by page. */
export function useDrivers(status: VerificationStatus | undefined) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: driverKeys.list(status),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      return api.get(`/admin/drivers?${params}`, adminDriverPageSchema, { signal });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useDriver(userId: string) {
  const api = useApi();
  return useQuery({
    queryKey: driverKeys.detail(userId),
    queryFn: ({ signal }) =>
      api.get(`/admin/drivers/${userId}`, adminDriverDetailSchema, { signal }),
  });
}

/** Approves or rejects a pending driver, then refreshes the detail and the lists. */
export function useReviewDriver(userId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) =>
      api.post(`/admin/drivers/${userId}/review`, input, adminDriverDetailSchema),
    onSuccess: (driver) => {
      queryClient.setQueryData(driverKeys.detail(userId), driver);
      return queryClient.invalidateQueries({ queryKey: driverKeys.all });
    },
  });
}
