import { useSyncExternalStore } from 'react';

/** `live`: the socket is authenticated and pushing; `reconnecting`: polling carries the screens. */
export type RealtimeStatus = 'live' | 'reconnecting';

/** While the socket is live, the fast polls drop to this; they stay as a safety net. */
export const LIVE_POLL_MS = 30_000;

let status: RealtimeStatus = 'reconnecting';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function setRealtimeStatus(next: RealtimeStatus) {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}

/** Whether pushes are arriving right now. Starts as `reconnecting`, so tests and signed-out screens poll as before. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  );
}

/** The interval for a poll that is `fastMs` without a socket and {@link LIVE_POLL_MS} with one. */
export function usePollMs(fastMs: number): number {
  return useRealtimeStatus() === 'live' ? Math.max(fastMs, LIVE_POLL_MS) : fastMs;
}
