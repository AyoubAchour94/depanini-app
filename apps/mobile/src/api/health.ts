import { healthResponseSchema } from '@depanini/shared';
import { useQuery } from '@tanstack/react-query';

import { env } from '@/config/env';

import { apiRequest } from './client';

/** Polls `GET /health` to show app → API connectivity. */
export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    // The API answers 503 with a valid body when its database is down.
    queryFn: ({ signal }) =>
      apiRequest('/health', healthResponseSchema, { acceptStatuses: [503], signal }),
    enabled: Boolean(env.apiUrl),
    refetchInterval: 30_000,
    // The interval is the retry; a failed check should show immediately.
    retry: false,
  });
}
