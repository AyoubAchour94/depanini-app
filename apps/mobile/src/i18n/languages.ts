/**
 * The one list of languages the app offers. Add a language here, then add its
 * message files in `locales/<code>/` and list them in `locales/index.ts`.
 */
export const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** What the user picked in Account: follow the phone, or force one language. */
export type LanguagePreference = 'system' | LanguageCode;

export const LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGES.map((language) => language.code);

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['system', ...LANGUAGE_CODES];

/** Used when the phone speaks a language the app does not offer, and for missing messages. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference);
}

/** The language to show: the forced one, or the first of the phone's languages the app offers. */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLanguages: readonly (string | null | undefined)[],
): LanguageCode {
  if (preference !== 'system') return preference;
  const match = deviceLanguages.find((code) => LANGUAGE_CODES.includes(code as LanguageCode));
  return (match as LanguageCode | undefined) ?? FALLBACK_LANGUAGE;
}
