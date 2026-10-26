import {
  type CustomerProfileInput,
  customerProfileSchema,
  type DriverProfileInput,
  driverProfileSchema,
  type MeResponse,
  meResponseSchema,
} from '@depanini/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { useAuth } from '@/auth/AuthProvider';

import { apiRequest } from './client';

/**
 * The signed-in account from `GET /me`. The first call after sign-up creates
 * the account on the API. Keyed by Firebase uid so switching users refetches.
 */
export function useMe() {
  const uid = useSignedInUid();
  return useQuery({
    queryKey: meQueryKey(uid),
    queryFn: ({ signal }) => apiRequest('/me', meResponseSchema, { signal }),
    enabled: Boolean(uid),
  });
}

/** Saves the customer profile (`PUT /me/customer-profile`) and updates the cached account. */
export function useSaveCustomerProfile() {
  const uid = useSignedInUid();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: CustomerProfileInput) =>
      apiRequest('/me/customer-profile', customerProfileSchema, { method: 'PUT', json: profile }),
    onSuccess: (customerProfile) =>
      queryClient.setQueryData<MeResponse>(
        meQueryKey(uid),
        (me) => me && { ...me, customerProfile },
      ),
  });
}

/** Saves the driver profile (`PUT /me/driver-profile`) and updates the cached account. */
export function useSaveDriverProfile() {
  const uid = useSignedInUid();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: DriverProfileInput) =>
      apiRequest('/me/driver-profile', driverProfileSchema, { method: 'PUT', json: profile }),
    onSuccess: (driverProfile) =>
      queryClient.setQueryData<MeResponse>(meQueryKey(uid), (me) => me && { ...me, driverProfile }),
  });
}

/**
 * `DELETE /me`: deletes the account and its profiles in both apps. The
 * Firebase user is deleted separately (see `DeleteAccountScreen`).
 */
export function deleteAccount(): Promise<void> {
  return apiRequest('/me', z.undefined(), { method: 'DELETE' });
}

const meQueryKey = (uid: string | undefined) => ['me', uid];

function useSignedInUid(): string | undefined {
  const auth = useAuth();
  return auth.status === 'signed-in' ? auth.user.uid : undefined;
}
