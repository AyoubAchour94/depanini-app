import i18n, { type TFunction } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { DEFAULT_LANGUAGE } from './languages';
import { NAMESPACES, resources } from './locales';

export * from './languages';
export { useTranslation };

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member -- the default export is the shared instance
  void i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: NAMESPACES,
    defaultNS: 'common',
    // React escapes text itself.
    interpolation: { escapeValue: false },
    // Resources are bundled: initialise synchronously so the first render has text.
    initAsync: false,
  });
}

export { i18n };

/** The active language code, e.g. "fr". For `Intl`. */
export const currentLanguage = (): string => i18n.language || DEFAULT_LANGUAGE;

/** `t` bound to the active language, for code that runs outside React. */
// eslint-disable-next-line import/no-named-as-default-member -- the default export is the shared instance
export const translate: TFunction = i18n.t.bind(i18n) as TFunction;
