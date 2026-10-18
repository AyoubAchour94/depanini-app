import { useEffect, useRef, useState } from 'react';

/** `m:ss`, rounded up so the display reaches 0:00 only when the time is up. */
export function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Milliseconds left until `expiresAt` by the device clock, updated every
 * second. `onElapsed` fires once when it reaches zero, so the caller can ask
 * the server, which is the one that flips the status.
 */
export function useCountdown(expiresAt: string | undefined, onElapsed: () => void): number | null {
  const target = expiresAt ? Date.parse(expiresAt) : null;
  const [now, setNow] = useState(() => Date.now());
  const elapsedRef = useRef(onElapsed);
  useEffect(() => {
    elapsedRef.current = onElapsed;
  });

  useEffect(() => {
    if (target === null) return;
    let fired = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= target && !fired) {
        fired = true;
        clearInterval(timer);
        elapsedRef.current();
      }
    };
    const timer = setInterval(tick, 1000);
    // Catches up right away: the target may have changed since `now` was read.
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [target]);

  return target === null ? null : Math.max(0, target - now);
}
