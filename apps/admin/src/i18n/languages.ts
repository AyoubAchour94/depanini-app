/**
 * The languages the admin app offers. Add a language here, then add its message
 * files in `locales/<code>/` and list them in `locales/index.ts`. No Arabic: the
 * admin app is a desktop tool for the team.
 */
export const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGES.map((language) => language.code);

/** The default language, and the one used for missing messages. */
export const DEFAULT_LANGUAGE: LanguageCode = 'fr';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGE_CODES.includes(value as LanguageCode);
}
