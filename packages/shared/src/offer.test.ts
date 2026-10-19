import { describe, expect, it } from 'vitest';

import { customerOfferSchema, OFFER_STATUSES, offerInputSchema, offerSchema } from './offer';

const offer = {
  id: '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f',
  requestId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  fare: 65,
  etaMin: 12,
  distanceToPickupM: 8_000,
  status: 'pending',
  expiresAt: '2026-01-01T10:03:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
};

describe('offerInputSchema', () => {
  it('accepts a whole-dinar fare', () => {
    expect(offerInputSchema.parse({ fare: 65 })).toEqual({ fare: 65 });
  });

  it.each([0, -5, 6.5, '65'])('rejects %s', (fare) => {
    expect(offerInputSchema.safeParse({ fare }).success).toBe(false);
  });
});

describe('offerSchema', () => {
  it('parses every status', () => {
    for (const status of OFFER_STATUSES) {
      expect(offerSchema.parse({ ...offer, status }).status).toBe(status);
    }
  });

  it('rejects an unknown status or a bad id', () => {
    expect(offerSchema.safeParse({ ...offer, status: 'maybe' }).success).toBe(false);
    expect(offerSchema.safeParse({ ...offer, id: 'nope' }).success).toBe(false);
  });
});

describe('customerOfferSchema', () => {
  it('adds the driver', () => {
    const parsed = customerOfferSchema.parse({
      ...offer,
      driver: { fullName: 'Ali', truckType: 'wheel_lift' },
    });
    expect(parsed.driver.fullName).toBe('Ali');
  });

  it('requires the driver', () => {
    expect(customerOfferSchema.safeParse(offer).success).toBe(false);
  });
});

describe('customerOfferSchema driver rating', () => {
  const driver = { fullName: 'Ali', truckType: 'wheel_lift' };

  it('parses a payload without a rating (old payloads)', () => {
    expect(customerOfferSchema.parse({ ...offer, driver }).driver.rating).toBeUndefined();
  });

  it('parses a rating, a null rating and a null average', () => {
    const rating = { average: 4.8, count: 10 };
    const parse = (r: unknown) =>
      customerOfferSchema.parse({ ...offer, driver: { ...driver, rating: r } }).driver.rating;
    expect(parse(rating)).toEqual(rating);
    expect(parse(null)).toBeNull();
    expect(parse({ average: null, count: 1 })?.average).toBeNull();
  });

  it('rejects a malformed rating', () => {
    const result = customerOfferSchema.safeParse({
      ...offer,
      driver: { ...driver, rating: { count: -1 } },
    });
    expect(result.success).toBe(false);
  });
});
