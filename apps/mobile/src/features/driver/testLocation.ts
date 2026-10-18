import { isInTunisia, type LatLng } from '@depanini/shared';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { env } from '@/config/env';

/** A place the driver app pretends to be at, instead of the device GPS. */
export type TestLocation = LatLng & { address: string };

const STORAGE_KEY = 'depanini.testLocation';

/** On in development builds and in builds made with EXPO_PUBLIC_ENABLE_TEST_LOCATION=1. */
export const isTestLocationEnabled = () => env.enableTestLocation;

// Kept in memory; on web it is also saved in localStorage so a reload keeps it.
// (AsyncStorage is not a dependency, so on native it lasts until the app closes.)
let current: TestLocation | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): TestLocation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TestLocation>;
    if (
      typeof value.latitude === 'number' &&
      typeof value.longitude === 'number' &&
      typeof value.address === 'string' &&
      isInTunisia({ latitude: value.latitude, longitude: value.longitude })
    ) {
      return { latitude: value.latitude, longitude: value.longitude, address: value.address };
    }
  } catch {
    // Corrupt value: ignore it.
  }
  return null;
}

function load() {
  if (loaded) return;
  loaded = true;
  if (Platform.OS !== 'web') return;
  try {
    current = parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    // Storage blocked: keep it in memory only.
  }
}

/** The chosen test location, or null to use the device GPS (always null when the feature is off). */
export function getTestLocation(): TestLocation | null {
  if (!isTestLocationEnabled()) return null;
  load();
  return current;
}

/** Sets the test location, or clears it with null. */
export function setTestLocation(next: TestLocation | null) {
  load();
  current = next;
  if (Platform.OS === 'web') {
    try {
      if (next) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      else globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: it stays in memory.
    }
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function useTestLocation(): TestLocation | null {
  return useSyncExternalStore(subscribe, getTestLocation, getTestLocation);
}

/** Forgets the in-memory state so the next read loads from storage again. For tests. */
export function resetTestLocationForTests() {
  current = null;
  loaded = false;
  listeners.clear();
}
