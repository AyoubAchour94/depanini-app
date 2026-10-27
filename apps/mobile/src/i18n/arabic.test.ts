import { createDriverStrings } from '@/features/driver/strings';
import { createRequestStrings } from '@/features/request/strings';
import { createTripStrings } from '@/features/trip/strings';
import { createVerificationStrings } from '@/features/verification/strings';

import { formatDistance, formatMinutes, formatMoney, formatTime } from './format';
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

// Arabic has six plural forms where English has two: `_one` and `_other` in
// English become `_zero` … `_other` in Arabic.
const PLURAL = /_(zero|one|two|few|many|other)$/;
const pluralBase = (key: string) => key.replace(PLURAL, '');

describe('Arabic messages', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(NAMESPACES)('has every English key of %s', (namespace) => {
    const ar = entries(resources.ar?.[namespace]).map(([key]) => key);
    const en = entries(resources.en?.[namespace]).map(([key]) => key);
    expect(en.filter((key) => !ar.includes(key))).toEqual([]);
  });

  it.each(NAMESPACES)('has no key of %s that English lacks, except plural forms', (namespace) => {
    const en = entries(resources.en?.[namespace]).map(([key]) => key);
    const enPlurals = new Set(en.filter((key) => PLURAL.test(key)).map(pluralBase));
    const ar = entries(resources.ar?.[namespace]).map(([key]) => key);
    expect(
      ar.filter(
        (key) => !en.includes(key) && !(PLURAL.test(key) && enPlurals.has(pluralBase(key))),
      ),
    ).toEqual([]);
  });

  it.each(NAMESPACES)('keeps the placeholders and tags of English in %s', (namespace) => {
    const ar = new Map(entries(resources.ar?.[namespace]));
    for (const [key, text] of entries(resources.en?.[namespace])) {
      // "عرض واحد" (one offer) needs no number.
      const expected = PLURAL.test(key)
        ? placeholders(text).filter((p) => p !== '{{count}}')
        : placeholders(text);
      const actual = placeholders(ar.get(key) ?? '');
      expect([key, PLURAL.test(key) ? actual.filter((p) => p !== '{{count}}') : actual]).toEqual([
        key,
        expected,
      ]);
    }
  });

  it('resolves the Arabic plural forms', async () => {
    await i18n.changeLanguage('ar');
    const request = createRequestStrings(translate);
    expect(request.offersCount(1)).toBe('عرض واحد');
    expect(request.offersCount(2)).toBe('عرضان');
    expect(request.offersCount(3)).toBe('3 عروض');
    expect(request.offersCount(11)).toBe('11 عرضًا');
    expect(createTripStrings(translate).starsLabel(5)).toBe('5 نجوم');
  });

  it('has a text for every screen key', async () => {
    await i18n.changeLanguage('ar');
    const all = [
      createRequestStrings,
      createDriverStrings,
      createTripStrings,
      createVerificationStrings,
    ].flatMap((create) => entries(create(translate)).map(([, text]) => text));
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((text) => /^[a-z]+:[\w.]+$/.test(text))).toEqual([]);
  });

  it('writes Western digits, and the price in Arabic order', async () => {
    await i18n.changeLanguage('ar');
    // The right-to-left mark makes "85 TND" read amount first, from the right.
    expect(formatMoney(85)).toBe('‏85 TND');
    expect(formatDistance(12_500)).toBe('12,5 كم');
    expect(formatMinutes(12)).toBe('12 د');
    expect(formatTime('2026-01-01T10:05:00.000Z')).toMatch(/[0-9]{1,2}:05/);
  });
});
