import type { NearbyRequest, PushData } from '@depanini/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useRef } from 'react';

import { JOB_KEY, NEARBY_KEY } from '@/api/driver';
import { useMe } from '@/api/me';
import { useAuth } from '@/auth/AuthProvider';
import { hasProfileFor } from '@/features/profile/onboarding';
import { variant } from '@/variant/variant';

import { registerForPush, setPushUser, subscribePushTaps, watchPushToken } from '.';
import { pushRoute } from './routing';

/**
 * Connects the app to push while someone is signed in: registers the token
 * when permission was already granted, keeps it fresh, and opens the right
 * screen when a notification is tapped. A tap that arrives before the account
 * and profile are loaded (the app was closed) waits for them, so the guarded
 * screens are open by the time it navigates. Asking for permission is not
 * done here: see `registerForPush` and where it is called.
 */
export function PushProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;
  const signedOut = auth.status === 'signed-out';
  const me = useMe();
  const accountLoaded = Boolean(uid && me.data);
  const ready = Boolean(uid && me.data && hasProfileFor(me.data, variant));
  // A tap waits here until the screens it opens are reachable.
  const pending = useRef<PushData | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    setPushUser(uid);
    if (!uid) return;
    return watchPushToken();
  }, [uid]);

  // Once the account exists on the API, register silently if the person already allowed pushes.
  useEffect(() => {
    if (accountLoaded) void registerForPush({ prompt: false });
  }, [accountLoaded, uid]);

  useEffect(() => {
    const open = () => {
      const data = pending.current;
      if (!data || !readyRef.current) return;
      pending.current = null;
      const href = pushRoute(data, {
        isDriverApp: variant.isDriverApp,
        hasNearbyRequest: (id) =>
          Boolean(
            queryClient
              .getQueryData<NearbyRequest[]>(NEARBY_KEY)
              ?.some((request) => request.id === id),
          ),
        hasJob: Boolean(queryClient.getQueryData(JOB_KEY)),
      });
      if (href) router.navigate(href);
    };
    readyRef.current = ready;
    // A tap meant for someone who has since signed out is not for the next person.
    if (signedOut) pending.current = null;
    open();
    return subscribePushTaps((tapped) => {
      pending.current = tapped;
      open();
    });
  }, [ready, signedOut, queryClient]);

  return children;
}
