import type { LatLng } from '@depanini/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { env } from '@/config/env';

import { reverseGeocode, searchPlaces } from './geocoding';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/** Follows `value`, but only after it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** ~1 m precision: tiny pin jitter reuses the cached address. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** The address at `coordinate`. Idle without a Mapbox token (callers show coordinates instead). */
export function useReverseGeocode(coordinate: LatLng | null) {
  const token = env.mapboxAccessToken;
  const latitude = coordinate && round(coordinate.latitude);
  const longitude = coordinate && round(coordinate.longitude);
  return useQuery({
    queryKey: ['places', 'reverse', latitude, longitude],
    queryFn: ({ signal }) =>
      reverseGeocode({ latitude: latitude!, longitude: longitude! }, token!, signal),
    enabled: Boolean(token) && latitude !== null && longitude !== null,
    retry: 1,
    staleTime: Infinity,
  });
}

/** Places matching what the user typed, debounced so each keystroke isn't a request. */
export function useSearchPlaces(query: string, proximity?: LatLng) {
  const token = env.mapboxAccessToken;
  const text = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  return useQuery({
    queryKey: ['places', 'search', text, proximity?.latitude, proximity?.longitude],
    queryFn: ({ signal }) => searchPlaces(text, proximity, token!, signal),
    enabled: Boolean(token) && text.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60_000,
  });
}
