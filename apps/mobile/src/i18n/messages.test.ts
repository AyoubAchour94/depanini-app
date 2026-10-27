import { createDriverStrings } from '@/features/driver/strings';
import { createRequestStrings } from '@/features/request/strings';
import { createTripStrings } from '@/features/trip/strings';
import { createVerificationStrings } from '@/features/verification/strings';

import { translate } from '.';

/** Every message of an object, however deeply nested. */
function messages(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(messages);
  if (value && typeof value === 'object') return Object.values(value).flatMap(messages);
  return [];
}

describe('English messages', () => {
  it.each([
    ['request', createRequestStrings],
    ['driver', createDriverStrings],
    ['trip', createTripStrings],
    ['verification', createVerificationStrings],
  ])('has a text for every %s key', (_name, create) => {
    const all = messages(create(translate));
    expect(all.length).toBeGreaterThan(20);
    // A missing key comes back as the key itself, e.g. "request:fareTitle".
    expect(all.filter((text) => /^[a-z]+:[\w.]+$/.test(text))).toEqual([]);
  });

  it('picks the singular and the plural form', () => {
    const request = createRequestStrings(translate);
    expect(request.offersCount(1)).toBe('1 offer');
    expect(request.offersCount(3)).toBe('3 offers');
    expect(createTripStrings(translate).starsLabel(1)).toBe('1 star');
  });
});
