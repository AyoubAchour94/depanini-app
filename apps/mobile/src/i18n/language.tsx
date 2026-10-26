import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { i18n, isLanguagePreference, type LanguagePreference, resolveLanguage } from '@/i18n';

export const LANGUAGE_PREFERENCE_KEY = 'depanini.languagePreference';

/** The saved preference; `system` when nothing valid is saved or storage fails. */
export async function loadLanguagePreference(): Promise<LanguagePreference> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    return isLanguagePreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

async function saveLanguagePreference(preference: LanguagePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, preference);
  } catch {
    // The choice still applies for this session; it just will not be remembered.
  }
}

/** The language codes of the phone, most preferred first. */
function deviceLanguages(): (string | null)[] {
  try {
    return getLocales().map((locale) => locale.languageCode);
  } catch {
    return [];
  }
}

interface LanguageSetting {
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  /** False until the saved preference has been read; the splash screen waits for it. */
  ready: boolean;
}

const SettingContext = createContext<LanguageSetting | null>(null);

/**
 * Applies the saved language (System / Français / العربية / English), with
 * System following the phone, to i18next. Mirrors `ThemeProvider`.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadLanguagePreference().then((saved) => {
      if (cancelled) return;
      setPreferenceState(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(preference, deviceLanguages()));
  }, [preference]);

  const setPreference = useCallback((next: LanguagePreference) => {
    setPreferenceState(next);
    void saveLanguagePreference(next);
  }, []);

  const setting = useMemo(
    () => ({ preference, setPreference, ready }),
    [preference, setPreference, ready],
  );
  return <SettingContext.Provider value={setting}>{children}</SettingContext.Provider>;
}

/** The System / Français / العربية / English setting. Outside a `LanguageProvider` it is fixed to System. */
export function useLanguageSetting(): LanguageSetting {
  return (
    useContext(SettingContext) ?? { preference: 'system', setPreference: () => {}, ready: true }
  );
}
