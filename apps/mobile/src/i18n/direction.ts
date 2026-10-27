import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadAppAsync } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { I18nManager, Platform } from 'react-native';

import { useTranslation } from '@/i18n';

export type Direction = 'ltr' | 'rtl';

const RTL_LANGUAGES: readonly string[] = ['ar'];

/** The writing direction of a language: right to left for Arabic. */
export function directionOf(language: string): Direction {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}

/** The direction of the active language. The layout follows it (see `DirectionRoot`). */
export function useDirection(): Direction {
  const { i18n } = useTranslation();
  return directionOf(i18n.language);
}

/** What `syncNativeDirection` needs from the native side; a seam for tests. */
export interface NativeDirection {
  /** The direction React Native laid the app out with when it started. */
  isRTL: () => boolean;
  /** Asks for a direction from the next start on. */
  setRTL: (rtl: boolean) => void;
  reload: () => Promise<void>;
  /** The direction the last reload was for, so a direction that does not stick never loops. */
  readAttempt: () => Promise<string | null>;
  writeAttempt: (direction: string | null) => Promise<void>;
}

const ATTEMPT_KEY = 'depanini.directionReload';

const reactNative: NativeDirection = {
  isRTL: () => I18nManager.isRTL,
  setRTL: (rtl) => {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  },
  reload: () => reloadAppAsync('The language changed between Arabic and a Latin language'),
  readAttempt: async () => {
    try {
      return await AsyncStorage.getItem(ATTEMPT_KEY);
    } catch {
      return null;
    }
  },
  writeAttempt: async (direction) => {
    try {
      if (direction) await AsyncStorage.setItem(ATTEMPT_KEY, direction);
      else await AsyncStorage.removeItem(ATTEMPT_KEY);
    } catch {
      // Without storage the next start may try once more; it cannot loop within a start.
    }
  },
};

/**
 * Makes React Native's own direction (`I18nManager`: native headers, back
 * gestures, text inputs) match the language. It only changes on a restart,
 * so the app reloads once. If the direction still does not match after that
 * reload, as in Expo Go, which resets it, it gives up for that direction:
 * `DirectionRoot` already lays the screens out in it.
 */
export async function syncNativeDirection(
  direction: Direction,
  native: NativeDirection = reactNative,
): Promise<'applied' | 'reloading' | 'unsupported'> {
  const rtl = direction === 'rtl';
  native.setRTL(rtl);
  if (native.isRTL() === rtl) {
    await native.writeAttempt(null);
    return 'applied';
  }
  if ((await native.readAttempt()) === direction) return 'unsupported';
  await native.writeAttempt(direction);
  await native.reload();
  return 'reloading';
}

/** Applies a language's direction outside React: `<html dir>` on web, `I18nManager` on a native build. */
export async function applyDirection(language: string): Promise<void> {
  const direction = directionOf(language);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = direction;
      document.documentElement.lang = language;
    }
    return;
  }
  // Expo Go resets the native direction whenever a project opens: a reload would not help.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
  await syncNativeDirection(direction);
}
