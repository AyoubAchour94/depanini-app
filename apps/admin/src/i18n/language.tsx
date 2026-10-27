import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DEFAULT_LANGUAGE, i18n, isLanguageCode, type LanguageCode } from '.';

export const LANGUAGE_KEY = 'depanini.admin.language';

/** The saved language; French when nothing valid is saved or storage is unavailable. */
export function loadLanguage(): LanguageCode {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    return isLanguageCode(saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function saveLanguage(language: LanguageCode) {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // The choice still applies for this visit; it just will not be remembered.
  }
}

interface LanguageSetting {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
}

const SettingContext = createContext<LanguageSetting | null>(null);

/** Applies the saved language to i18next and to `<html lang>`, and remembers changes. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const saved = loadLanguage();
    // Before the first render of the children, so it never shows the wrong language.
    if (i18n.language !== saved) void i18n.changeLanguage(saved);
    return saved;
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: LanguageCode) => {
    void i18n.changeLanguage(next);
    setLanguageState(next);
    saveLanguage(next);
  }, []);

  const setting = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <SettingContext.Provider value={setting}>{children}</SettingContext.Provider>;
}

/** The language setting. Outside a `LanguageProvider` it is fixed to the default. */
export function useLanguageSetting(): LanguageSetting {
  return useContext(SettingContext) ?? { language: DEFAULT_LANGUAGE, setLanguage: () => {} };
}
