import { isInTunisia } from '@depanini/shared';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { putPresence } from '@/api/driver';

/** How often an online driver's location is sent. The API treats 2 minutes of silence as offline. */
export const PRESENCE_INTERVAL_MS = 15_000;

export type PresenceProblem = 'denied' | 'unavailable' | null;

/**
 * The driver's online switch. Online state lives in memory only, so every app
 * start begins offline. While online and `focused`, the location goes to the
 * API right away and every {@link PRESENCE_INTERVAL_MS} after; a blur or an
 * unmount stops it (the API lets the driver lapse), and switching off tells
 * the API at once.
 */
export function useDriverPresence(focused: boolean) {
  const [online, setOnline] = useState(false);
  const [problem, setProblem] = useState<PresenceProblem>(null);
  // Guards a switch-on still waiting for the permission when the screen goes away.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!online || !focused) return;
    let cancelled = false;
    const send = async () => {
      try {
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        // The API rejects places outside Tunisia; the next tick tries again.
        if (cancelled || !isInTunisia(location)) return;
        await putPresence({ online: true, location });
      } catch {
        // Offline or no fix right now: the next tick tries again.
      }
    };
    void send();
    const timer = setInterval(() => void send(), PRESENCE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [online, focused]);

  const goOnline = useCallback(async () => {
    setProblem(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current) return;
      if (!permission.granted) return setProblem('denied');
      setOnline(true);
    } catch {
      if (mounted.current) setProblem('unavailable');
    }
  }, []);

  const goOffline = useCallback(() => {
    setOnline(false);
    setProblem(null);
    void putPresence({ online: false }).catch(() => {
      // The API drops the driver after 2 minutes without a location anyway.
    });
  }, []);

  return { online, problem, goOnline, goOffline };
}
