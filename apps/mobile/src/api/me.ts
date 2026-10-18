import {
  type CustomerProfileInput,
  customerProfileSchema,
  type MeResponse,
  meResponseSchema,
} from '@depanini/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthProvider';
import type { VariantConfig } from '@/variant/variants';

import { apiRequest } from './client';

/**
 * The signed-in account from `GET /me`. The first call after sign-up creates
 * the account on the API. Keyed by Firebase uid so switching users refetches.
 */
export function useMe() {
  const uid = useSignedInUid();
  return useQuery({
    queryKey: ['me', uid],
    queryFn: () => apiRequest('/me', meResponseSchema),
    enabled: Boolean(uid),
  });
}

/**
 * Whether the account has the profile this app needs; without it the app
 * routes to onboarding. The driver profile arrives with #8, so until then the
 * driver app never onboards.
 */
export function hasProfileFor(me: MeResponse, variant: VariantConfig): boolean {
  return variant.isDriverApp || me.customerProfile !== null;
}

/** Saves the customer profile (`PUT /me/customer-profile`) and updates the cached account. */
export function useSaveCustomerProfile() {
  const uid = useSignedInUid();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: CustomerProfileInput) =>
      apiRequest('/me/customer-profile', customerProfileSchema, { method: 'PUT', json: profile }),
    onSuccess: (customerProfile) =>
      queryClient.setQueryData<MeResponse>(['me', uid], (me) => me && { ...me, customerProfile }),
  });
}

function useSignedInUid(): string | undefined {
  const auth = useAuth();
  return auth.status === 'signed-in' ? auth.user.uid : undefined;
}
