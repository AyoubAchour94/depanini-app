import { useMutation, useQueryClient } from '@tanstack/react-query';

import { signOut } from './firebase-auth';

/** Signs out and drops the previous user's cached API data. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.clear(),
  });
}
