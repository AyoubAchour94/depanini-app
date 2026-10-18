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
 *
 * Sends never overlap (a tick is skipped while one is pending), and the
 * `online: false` request always goes out after any `online: true` one.
 */
export function useDriverPresence(focused: boolean) {
  const [online, setOnline] = useState(false);
  const [problem, setProblem] = useState<PresenceProblem>(null);
  const mounted = useRef(true);
  // Bumped by every switch-off; work that started before it must not go online.
  const generation = useRef(0);
  const sending = useRef(false);
  // The `online: true` request on the wire, if any.
  const wire = useRef<Promise<unknown> | null>(null);
  const promptPending = useRef(false);

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
      if (sending.current) return;
      sending.current = true;
      const started = generation.current;
      try {
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        // The API rejects places outside Tunisia; the next tick tries again.
        if (cancelled || started !== generation.current || !isInTunisia(location)) return;
        const request = putPresence({ online: true, location });
        wire.current = request;
        await request;
      } catch {
        // Offline or no fix right now: the next tick tries again.
      } finally {
        sending.current = false;
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
    if (promptPending.current) return;
    promptPending.current = true;
    const started = generation.current;
    setProblem(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      // Unmounted, or switched off while the prompt was open.
      if (!mounted.current || started !== generation.current) return;
      if (!permission.granted) return setProblem('denied');
      setOnline(true);
    } catch {
      if (mounted.current && started === generation.current) setProblem('unavailable');
    } finally {
      promptPending.current = false;
    }
  }, []);

  const goOffline = useCallback(() => {
    generation.current += 1;
    setOnline(false);
    setProblem(null);
    const inFlight = wire.current;
    void (async () => {
      // Let an `online: true` request on the wire land first, so ours is last.
      await inFlight?.catch(() => {});
      await putPresence({ online: false }).catch(() => {
        // The API drops the driver after 2 minutes without a location anyway.
      });
    })();
  }, []);

  return { online, problem, goOnline, goOffline };
}
