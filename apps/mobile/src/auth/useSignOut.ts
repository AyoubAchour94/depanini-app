import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unregisterPush } from '@/push';

import { signOut } from './firebase-auth';

/**
 * Signs out and drops the previous user's cached API data. The push token
 * goes first (it needs the sign-in to authenticate), best effort, so the next
 * person on this phone is not sent this person's notifications.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await unregisterPush();
      await signOut();
    },
    onSuccess: () => queryClient.clear(),
  });
}
