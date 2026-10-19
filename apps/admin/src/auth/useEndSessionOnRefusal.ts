import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ApiError } from '../api/client';
import { useAuth } from './AuthProvider';

const isRefusal = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

/**
 * Watches every query and mutation: when the API refuses the session (401/403) the admin
 * claim has been revoked mid-session, so sign out and say "Not an admin".
 */
export function useEndSessionOnRefusal() {
  const queryClient = useQueryClient();
  const { endRevokedSession } = useAuth();

  useEffect(() => {
    let ended = false;
    const onEvent = (event: { type: string; action?: { type: string; error?: unknown } }) => {
      if (ended || event.type !== 'updated' || event.action?.type !== 'error') return;
      if (!isRefusal(event.action.error)) return;
      ended = true;
      void endRevokedSession();
    };
    const stopQueries = queryClient.getQueryCache().subscribe(onEvent);
    const stopMutations = queryClient.getMutationCache().subscribe(onEvent);
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [queryClient, endRevokedSession]);
}
