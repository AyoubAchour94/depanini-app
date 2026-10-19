import { describe, expect, it } from 'vitest';

import { nearbyRequestSchema } from './nearby';

const nearby = {
  id: '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f',
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Tunis' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  vehicleType: 'car',
  problemType: 'battery',
  distanceM: 12_000,
  proposedFare: 60,
  suggestedFare: 64,
  minFare: 52,
  maxFare: 192,
  expiresAt: '2026-01-01T10:15:00.000Z',
  distanceToPickupM: 4_000,
};

describe('nearbyRequestSchema', () => {
  it('parses a request without an offer', () => {
    expect(nearbyRequestSchema.parse(nearby).myOffer).toBeUndefined();
  });

  it('parses a request with my offer', () => {
    const parsed = nearbyRequestSchema.parse({
      ...nearby,
      myOffer: {
        id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
        requestId: nearby.id,
        fare: 60,
        etaMin: 8,
        distanceToPickupM: 4_000,
        status: 'pending',
        expiresAt: '2026-01-01T10:03:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    });
    expect(parsed.myOffer?.fare).toBe(60);
  });

  it('does not pass customer contact through', () => {
    const parsed = nearbyRequestSchema.parse({
      ...nearby,
      customer: { fullName: 'Sami', phone: '+21622123456' },
    });
    expect(parsed.customer).toEqual({});
  });

  it('requires distanceToPickupM', () => {
    expect(nearbyRequestSchema.safeParse({ ...nearby, distanceToPickupM: undefined }).success).toBe(
      false,
    );
  });
});

describe('nearbyRequestSchema customer rating', () => {
  it('parses a payload without a customer (old payloads)', () => {
    expect(nearbyRequestSchema.parse(nearby).customer).toBeUndefined();
  });

  it('parses a customer with and without a rating', () => {
    const parse = (customer: unknown) =>
      nearbyRequestSchema.parse({ ...nearby, customer }).customer;
    expect(parse({ rating: { average: 4.2, count: 9 } })?.rating).toEqual({
      average: 4.2,
      count: 9,
    });
    expect(parse({ rating: { average: null, count: 1 } })?.rating?.average).toBeNull();
    expect(parse({})?.rating).toBeUndefined();
    expect(parse(null)).toBeNull();
  });

  it('rejects a malformed customer rating', () => {
    const customer = { rating: { average: 9, count: 3 } };
    expect(nearbyRequestSchema.safeParse({ ...nearby, customer }).success).toBe(false);
  });
});
