import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_RATING_TAGS,
  customerRatingInputSchema,
  DRIVER_RATING_TAGS,
  driverRatingInputSchema,
  myRatingSchema,
  RATING_NEW_THRESHOLD,
  RATING_WINDOW_DAYS,
  ratingSummarySchema,
} from './rating';

describe('constants', () => {
  it('lists the tags of each side', () => {
    expect([...CUSTOMER_RATING_TAGS]).toEqual([
      'on_time',
      'careful_with_vehicle',
      'friendly',
      'fair_price',
      'late',
      'rough_handling',
      'rude',
    ]);
    expect([...DRIVER_RATING_TAGS]).toEqual([
      'clear_location',
      'ready_on_time',
      'friendly',
      'wrong_location',
      'made_me_wait',
      'rude',
    ]);
  });

  it('sets the window and the threshold', () => {
    expect(RATING_WINDOW_DAYS).toBe(7);
    expect(RATING_NEW_THRESHOLD).toBe(3);
  });
});

describe('customerRatingInputSchema', () => {
  it.each([1, 2, 3, 4, 5])('accepts %i stars with a tag', (stars) => {
    expect(customerRatingInputSchema.parse({ stars, tags: ['friendly'] }).stars).toBe(stars);
  });

  it.each([0, 6, -1, 3.5, '4', null])('rejects stars %s', (stars) => {
    expect(customerRatingInputSchema.safeParse({ stars, tags: ['friendly'] }).success).toBe(false);
  });

  it('needs no tag at 3 stars or more, and defaults tags to empty', () => {
    expect(customerRatingInputSchema.parse({ stars: 3 })).toEqual({ stars: 3, tags: [] });
    expect(customerRatingInputSchema.parse({ stars: 5, tags: [] }).tags).toEqual([]);
  });

  it.each([1, 2])('needs a tag at %i stars, reported on the tags path', (stars) => {
    for (const input of [{ stars }, { stars, tags: [] }]) {
      const result = customerRatingInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['tags']);
    }
    expect(customerRatingInputSchema.safeParse({ stars, tags: ['late'] }).success).toBe(true);
  });

  it('accepts every customer tag and rejects driver-only and unknown ones', () => {
    for (const tag of CUSTOMER_RATING_TAGS) {
      expect(customerRatingInputSchema.safeParse({ stars: 4, tags: [tag] }).success).toBe(true);
    }
    for (const tag of ['clear_location', 'ready_on_time', 'wrong_location', 'made_me_wait', 'x']) {
      expect(customerRatingInputSchema.safeParse({ stars: 4, tags: [tag] }).success).toBe(false);
    }
  });

  it('rejects duplicate tags', () => {
    const result = customerRatingInputSchema.safeParse({ stars: 4, tags: ['rude', 'rude'] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['tags']);
  });

  it('allows at most 5 tags', () => {
    const five = CUSTOMER_RATING_TAGS.slice(0, 5);
    expect(customerRatingInputSchema.safeParse({ stars: 4, tags: five }).success).toBe(true);
    const six = CUSTOMER_RATING_TAGS.slice(0, 6);
    expect(customerRatingInputSchema.safeParse({ stars: 4, tags: six }).success).toBe(false);
  });

  it('trims the comment and allows exactly 300 characters', () => {
    expect(customerRatingInputSchema.parse({ stars: 4, comment: '  Great  ' }).comment).toBe(
      'Great',
    );
    expect(
      customerRatingInputSchema.safeParse({ stars: 4, comment: 'a'.repeat(300) }).success,
    ).toBe(true);
    expect(
      customerRatingInputSchema.safeParse({ stars: 4, comment: 'a'.repeat(301) }).success,
    ).toBe(false);
  });

  it('measures the trimmed comment, and treats a blank one as none', () => {
    const padded = ` ${'a'.repeat(300)} `;
    expect(customerRatingInputSchema.safeParse({ stars: 4, comment: padded }).success).toBe(true);
    expect(customerRatingInputSchema.parse({ stars: 4, comment: '   ' }).comment).toBeUndefined();
  });
});

describe('driverRatingInputSchema', () => {
  it('accepts every driver tag and rejects customer-only and unknown ones', () => {
    for (const tag of DRIVER_RATING_TAGS) {
      expect(driverRatingInputSchema.safeParse({ stars: 4, tags: [tag] }).success).toBe(true);
    }
    for (const tag of ['on_time', 'careful_with_vehicle', 'fair_price', 'late', 'rough_handling']) {
      expect(driverRatingInputSchema.safeParse({ stars: 4, tags: [tag] }).success).toBe(false);
    }
  });

  it('applies the low-star rule, uniqueness and the cap', () => {
    expect(driverRatingInputSchema.safeParse({ stars: 2 }).success).toBe(false);
    expect(driverRatingInputSchema.safeParse({ stars: 2, tags: ['made_me_wait'] }).success).toBe(
      true,
    );
    expect(driverRatingInputSchema.safeParse({ stars: 4, tags: ['rude', 'rude'] }).success).toBe(
      false,
    );
    expect(
      driverRatingInputSchema.safeParse({ stars: 4, tags: [...DRIVER_RATING_TAGS] }).success,
    ).toBe(false);
  });
});

describe('ratingSummarySchema', () => {
  it('parses an average and a count', () => {
    expect(ratingSummarySchema.parse({ average: 4.5, count: 12 })).toEqual({
      average: 4.5,
      count: 12,
    });
  });

  it('rounds the average to one decimal', () => {
    expect(ratingSummarySchema.parse({ average: 4.666, count: 3 }).average).toBe(4.7);
    expect(ratingSummarySchema.parse({ average: 4.24, count: 3 }).average).toBe(4.2);
  });

  it('allows a null or missing average below the threshold', () => {
    expect(ratingSummarySchema.parse({ average: null, count: 2 }).average).toBeNull();
    expect(ratingSummarySchema.parse({ count: 0 }).average).toBeUndefined();
  });

  it('keeps the average between 1 and 5', () => {
    expect(ratingSummarySchema.safeParse({ average: 1, count: 3 }).success).toBe(true);
    expect(ratingSummarySchema.safeParse({ average: 5, count: 3 }).success).toBe(true);
    expect(ratingSummarySchema.safeParse({ average: 0.9, count: 3 }).success).toBe(false);
    expect(ratingSummarySchema.safeParse({ average: 5.1, count: 3 }).success).toBe(false);
  });

  it.each([-1, 1.5, '3'])('rejects count %s', (count) => {
    expect(ratingSummarySchema.safeParse({ average: 4, count }).success).toBe(false);
  });
});

describe('myRatingSchema', () => {
  const base = {
    mine: null,
    otherSideRated: false,
    canRate: true,
    deadline: '2026-01-08T10:00:00.000Z',
  };

  it('parses when I have not rated', () => {
    expect(myRatingSchema.parse(base)).toEqual(base);
  });

  it('parses my rating with and without a comment', () => {
    const mine = { stars: 2, tags: ['late'], comment: 'Slow' };
    expect(myRatingSchema.parse({ ...base, mine, canRate: false }).mine).toEqual(mine);
    const noComment = { stars: 5, tags: [], comment: null };
    expect(myRatingSchema.parse({ ...base, mine: noComment }).mine?.comment).toBeNull();
  });

  it('rejects bad stars, a bad deadline or a missing flag', () => {
    expect(myRatingSchema.safeParse({ ...base, mine: { stars: 6, tags: [] } }).success).toBe(false);
    expect(myRatingSchema.safeParse({ ...base, deadline: 'soon' }).success).toBe(false);
    expect(myRatingSchema.safeParse({ ...base, canRate: undefined }).success).toBe(false);
  });
});
