import { meResponseSchema } from '@depanini/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthProvider';

import { apiRequest } from './client';

/**
 * The signed-in account from `GET /me`. The first call after sign-up creates
 * the account on the API. Keyed by Firebase uid so switching users refetches.
 */
export function useMe() {
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : undefined;
  return useQuery({
    queryKey: ['me', uid],
    queryFn: () => apiRequest('/me', meResponseSchema),
    enabled: Boolean(uid),
  });
}
