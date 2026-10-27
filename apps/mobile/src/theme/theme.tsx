import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { useTranslation } from '@/i18n';
import { variant } from '@/variant/variant';
import { buildTheme, type Scheme, type Script, type Theme } from './tokens';

const appVariant = () => (variant.isDriverApp ? 'driver' : 'user');

/** Arabic text is set in IBM Plex Sans Arabic, everything else in Inter. */
function useScript(): Script {
  const { i18n } = useTranslation();
  return i18n.language === 'ar' ? 'arabic' : 'latin';
}

export type { Theme } from './tokens';

/** What the user picked in Account: follow the phone, or force one scheme. */
export type ThemePreference = 'system' | Scheme;

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const THEME_PREFERENCE_KEY = 'depanini.themePreference';

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

/** The saved preference; `system` when nothing valid is saved or storage fails. */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const saved = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
    return isThemePreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    // The choice still applies for this session; it just will not be remembered.
  }
}

interface ThemeSetting {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** False until the saved preference has been read; the splash screen waits for it. */
  ready: boolean;
}

const SettingContext = createContext<ThemeSetting | null>(null);
const ThemeContext = createContext<Theme | null>(null);

/**
 * Provides the resolved theme: the saved preference (System / Light / Dark),
 * with System following the phone, tinted with this app's variant.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const system = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    void loadThemePreference().then((saved) => {
      if (cancelled) return;
      setPreferenceState(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void saveThemePreference(next);
  }, []);

  const scheme: Scheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const script = useScript();
  const theme = useMemo(() => buildTheme(scheme, appVariant(), script), [scheme, script]);
  const setting = useMemo(
    () => ({ preference, setPreference, ready }),
    [preference, setPreference, ready],
  );

  return (
    <SettingContext.Provider value={setting}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </SettingContext.Provider>
  );
}

/**
 * The current theme, resolved from the user's setting. Without a
 * `ThemeProvider` (a screen rendered alone) it follows the phone.
 */
export function useTheme(): Theme {
  const provided = useContext(ThemeContext);
  const system = useColorScheme();
  const script = useScript();
  return useMemo(
    () => provided ?? buildTheme(system === 'dark' ? 'dark' : 'light', appVariant(), script),
    [provided, system, script],
  );
}

/** The System / Light / Dark setting. Outside a `ThemeProvider` it is fixed to System. */
export function useThemeSetting(): ThemeSetting {
  return (
    useContext(SettingContext) ?? { preference: 'system', setPreference: () => {}, ready: true }
  );
}
