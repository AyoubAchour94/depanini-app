import i18n, { type TFunction } from 'i18next';
import { useMemo } from 'react';
import { initReactI18next, Trans, useTranslation } from 'react-i18next';

import { FALLBACK_LANGUAGE } from './languages';
import { NAMESPACES, resources } from './locales';

export * from './languages';
export { Trans, useTranslation };

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member -- the default export is the shared instance
  void i18n.use(initReactI18next).init({
    resources,
    lng: FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    ns: NAMESPACES,
    defaultNS: 'common',
    // React Native does not render HTML, so there is nothing to escape.
    interpolation: { escapeValue: false },
    // Resources are bundled: initialise synchronously so the first render has text.
    initAsync: false,
  });
}

export { i18n };

/** The active language code, e.g. "en". For `Intl` and for event-time helpers. */
export const currentLanguage = (): string => i18n.language || FALLBACK_LANGUAGE;

/** `t` bound to the active language, for code that runs outside React (alerts, share text). */
// eslint-disable-next-line import/no-named-as-default-member -- the default export is the shared instance
export const translate: TFunction = i18n.t.bind(i18n) as TFunction;

/**
 * Builds a screen's message object from `t`. The result changes with the
 * language, so a component that uses it re-renders when the language does.
 */
export function useStrings<S>(factory: (t: TFunction) => S): S {
  const { t } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `factory` is a module-level function
  return useMemo(() => factory(t), [t]);
}

/**
 * The same messages for code outside React: reads the active language at each
 * access, so it is always current when an event handler runs.
 */
export function liveStrings<S extends object>(factory: (t: TFunction) => S): S {
  let cached: { language: string; strings: S } | undefined;
  const current = () => {
    const language = currentLanguage();
    if (cached?.language !== language) cached = { language, strings: factory(translate) };
    return cached.strings;
  };
  return new Proxy({} as S, { get: (_target, key) => Reflect.get(current(), key) });
}
