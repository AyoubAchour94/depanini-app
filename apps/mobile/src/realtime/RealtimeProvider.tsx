import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { env } from '@/config/env';
import { resetTruckLocation } from '@/features/driver/usePresence';
import { getCurrentIdToken } from '@/firebase/firebase';
import { variant } from '@/variant/variant';

import { applyRealtimeMessage } from './apply';
import { RealtimeClient, toWsUrl } from './client';
import { setRealtimeStatus } from './status';

/**
 * Keeps the `/ws` connection while someone is signed in and feeds what it
 * pushes into the query cache. Without a socket the screens keep polling, so
 * a missing API URL or a dropped connection only makes things a bit slower.
 * Sign-out and a change of user also forget the last truck position, so the
 * next driver on this device never sees the previous one's.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;

  useEffect(() => {
    resetTruckLocation();
    if (!uid || !env.apiUrl) return;
    const role = variant.isDriverApp ? 'driver' : 'customer';
    let firstLive = true;
    const client = new RealtimeClient({
      url: toWsUrl(env.apiUrl),
      getToken: getCurrentIdToken,
      onMessage: (message) => applyRealtimeMessage(queryClient, message, role),
      onStatus: (status) => {
        setRealtimeStatus(status);
        // Pushes sent while the socket was down are lost: read everything on screen again.
        if (status === 'live' && !firstLive) void queryClient.invalidateQueries();
        if (status === 'live') firstLive = false;
      },
    });
    const subscription = AppState.addEventListener('change', (state) =>
      client.setActive(state === 'active'),
    );
    client.setActive(AppState.currentState !== 'background');
    client.start();
    return () => {
      subscription.remove();
      client.stop();
      setRealtimeStatus('reconnecting');
    };
  }, [uid, queryClient]);

  return children;
}
