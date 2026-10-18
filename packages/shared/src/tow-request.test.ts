import { describe, expect, it } from 'vitest';

import {
  fareEstimateInputSchema,
  placeSchema,
  problemTypeSchema,
  towRequestInputSchema,
  towRequestPageSchema,
  towRequestSchema,
  vehicleTypeSchema,
} from './tow-request';

const pickup = { latitude: 36.8, longitude: 10.18, address: 'Avenue Habib Bourguiba, Tunis' };
const dropoff = { latitude: 36.85, longitude: 10.3, address: 'La Marsa' };
const input = {
  pickup,
  dropoff,
  vehicleType: 'car',
  problemType: 'breakdown',
  proposedFare: 60,
};

describe('enums', () => {
  it('rejects unknown values', () => {
    expect(vehicleTypeSchema.safeParse('truck').success).toBe(false);
    expect(problemTypeSchema.safeParse('boom').success).toBe(false);
    expect(vehicleTypeSchema.parse('suv_van')).toBe('suv_van');
    expect(problemTypeSchema.parse('out_of_fuel')).toBe('out_of_fuel');
  });
});

describe('placeSchema', () => {
  it('accepts a place and trims the address', () => {
    expect(placeSchema.parse({ ...pickup, address: '  Tunis  ' }).address).toBe('Tunis');
  });

  it.each([
    [{ latitude: 48.85, longitude: 2.35 }], // Paris
    [{ latitude: 30.1, longitude: 10 }],
    [{ latitude: 37.7, longitude: 10 }],
    [{ latitude: 34, longitude: 7.4 }],
    [{ latitude: 34, longitude: 11.8 }],
  ])('rejects %j outside Tunisia', (coords) => {
    expect(placeSchema.safeParse({ ...coords, address: 'x' }).success).toBe(false);
  });

  it('rejects an empty or too long address', () => {
    expect(placeSchema.safeParse({ ...pickup, address: '   ' }).success).toBe(false);
    expect(placeSchema.safeParse({ ...pickup, address: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('fareEstimateInputSchema', () => {
  it('needs a known vehicle type', () => {
    expect(fareEstimateInputSchema.safeParse({ pickup, dropoff, vehicleType: 'car' }).success).toBe(
      true,
    );
    expect(fareEstimateInputSchema.safeParse({ pickup, dropoff, vehicleType: 'bus' }).success).toBe(
      false,
    );
  });
});

describe('towRequestInputSchema', () => {
  it('accepts a request without a note', () => {
    expect(towRequestInputSchema.parse(input).note).toBeUndefined();
  });

  it('trims the note and turns an empty one into undefined', () => {
    expect(towRequestInputSchema.parse({ ...input, note: '  flat  ' }).note).toBe('flat');
    expect(towRequestInputSchema.parse({ ...input, note: '   ' }).note).toBeUndefined();
  });

  it('rejects a note over 280 characters', () => {
    expect(towRequestInputSchema.safeParse({ ...input, note: 'a'.repeat(281) }).success).toBe(
      false,
    );
    expect(towRequestInputSchema.safeParse({ ...input, note: 'a'.repeat(280) }).success).toBe(true);
  });

  it('requires a positive whole-dinar fare', () => {
    expect(towRequestInputSchema.safeParse({ ...input, proposedFare: 60.5 }).success).toBe(false);
    expect(towRequestInputSchema.safeParse({ ...input, proposedFare: 0 }).success).toBe(false);
  });

  it('rejects an unknown problem type', () => {
    expect(towRequestInputSchema.safeParse({ ...input, problemType: 'x' }).success).toBe(false);
  });
});

describe('towRequestSchema', () => {
  const request = {
    ...input,
    id: '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10',
    status: 'open',
    distanceM: 12_345,
    suggestedFare: 65,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
  };

  it('parses a response and a page', () => {
    expect(towRequestSchema.parse(request).status).toBe('open');
    const page = towRequestPageSchema.parse({ items: [request], nextCursor: null });
    expect(page.items).toHaveLength(1);
  });

  it('rejects an unknown status', () => {
    expect(towRequestSchema.safeParse({ ...request, status: 'assigned' }).success).toBe(false);
  });
});
