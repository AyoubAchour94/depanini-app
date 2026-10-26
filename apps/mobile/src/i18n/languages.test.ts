import { FALLBACK_LANGUAGE, isLanguagePreference, LANGUAGES, resolveLanguage } from './languages';

describe('resolveLanguage', () => {
  it('uses the forced language whatever the phone speaks', () => {
    expect(resolveLanguage('ar', ['fr'])).toBe('ar');
    expect(resolveLanguage('en', [])).toBe('en');
  });

  it('follows the first of the phone languages the app offers', () => {
    expect(resolveLanguage('system', ['de', 'ar', 'fr'])).toBe('ar');
    expect(resolveLanguage('system', [null, 'fr'])).toBe('fr');
  });

  it('falls back when the phone speaks none of them', () => {
    expect(resolveLanguage('system', ['de', 'es'])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage('system', [])).toBe(FALLBACK_LANGUAGE);
  });
});

describe('isLanguagePreference', () => {
  it('accepts System and every listed language, nothing else', () => {
    expect(isLanguagePreference('system')).toBe(true);
    for (const { code } of LANGUAGES) expect(isLanguagePreference(code)).toBe(true);
    expect(isLanguagePreference('de')).toBe(false);
    expect(isLanguagePreference(undefined)).toBe(false);
  });
});
