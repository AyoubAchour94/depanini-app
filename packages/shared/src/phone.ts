import { z } from 'zod';

/**
 * A Tunisian phone number, normalized to `+216` followed by 8 digits.
 *
 * Accepts the ways people type it: with spaces, dashes or dots between digit
 * groups, with `00216` instead of `+216`, or the bare 8 digits. Contact info
 * only; nothing checks that the number is reachable.
 */
export const tunisianPhoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const compact = value.replace(/[\s.-]/g, '').replace(/^00216/, '+216');
    return /^\d{8}$/.test(compact) ? `+216${compact}` : compact;
  })
  .pipe(z.string().regex(/^\+216\d{8}$/, 'Enter a Tunisian number: +216 followed by 8 digits'));
