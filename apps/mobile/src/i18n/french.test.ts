import { createDriverStrings } from '@/features/driver/strings';
import { createRequestStrings } from '@/features/request/strings';
import { createTripStrings } from '@/features/trip/strings';
import { createVerificationStrings } from '@/features/verification/strings';

import { FALLBACK_LANGUAGE } from './languages';
import { NAMESPACES, resources } from './locales';

import { i18n, translate } from '.';

/** Every message of a file as `[dotted path, text]`. */
function entries(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix.slice(0, -1), value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => entries(child, `${prefix}${key}.`));
  }
  return [];
}

const placeholders = (text: string) => (text.match(/{{\w+}}|<\/?\w+>/g) ?? []).sort();

describe('French messages', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('is the default and fallback language', () => {
    expect(FALLBACK_LANGUAGE).toBe('fr');
  });

  it.each(NAMESPACES)('has every English key of %s, and no other', (namespace) => {
    const en = entries(resources.en?.[namespace]).map(([key]) => key);
    const fr = entries(resources.fr?.[namespace]).map(([key]) => key);
    expect(en.filter((key) => !fr.includes(key))).toEqual([]);
    expect(fr.filter((key) => !en.includes(key))).toEqual([]);
  });

  it.each(NAMESPACES)('keeps the placeholders and tags of English in %s', (namespace) => {
    const fr = new Map(entries(resources.fr?.[namespace]));
    for (const [key, text] of entries(resources.en?.[namespace])) {
      expect([key, placeholders(fr.get(key) ?? '')]).toEqual([key, placeholders(text)]);
    }
  });

  it('resolves the plural forms', async () => {
    await i18n.changeLanguage('fr');
    const request = createRequestStrings(translate);
    expect(request.offersCount(1)).toBe('1 offre');
    expect(request.offersCount(3)).toBe('3 offres');
    expect(createTripStrings(translate).starsLabel(2)).toBe('2 étoiles');
  });

  it('has a text for every screen key', async () => {
    await i18n.changeLanguage('fr');
    const all = [
      createRequestStrings,
      createDriverStrings,
      createTripStrings,
      createVerificationStrings,
    ].flatMap((create) => entries(create(translate)).map(([, text]) => text));
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((text) => /^[a-z]+:[\w.]+$/.test(text))).toEqual([]);
  });
});
