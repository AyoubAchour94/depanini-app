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
    expect(towRequestSchema.safeParse({ ...request, status: 'finished' }).success).toBe(false);
  });
});

describe('towRequestSchema, assigned', () => {
  const base = {
    id: '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f',
    status: 'open',
    pickup,
    dropoff,
    vehicleType: 'car',
    problemType: 'breakdown',
    distanceM: 12_000,
    suggestedFare: 64,
    proposedFare: 60,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
  };

  it('still parses a Phase 3 request without the new fields', () => {
    expect(towRequestSchema.safeParse(base).success).toBe(true);
    expect(towRequestSchema.safeParse({ ...base, agreedFare: null, driver: null }).success).toBe(
      true,
    );
  });

  it('parses an assigned request with its driver', () => {
    const parsed = towRequestSchema.parse({
      ...base,
      status: 'assigned',
      agreedFare: 70,
      assignedAt: '2026-01-01T10:05:00.000Z',
      driver: {
        fullName: 'Ali',
        phone: '+21622123456',
        truckType: 'flatbed',
        plateNumber: '1 TN 2',
      },
    });
    expect(parsed.driver?.truckType).toBe('flatbed');
    expect(parsed.agreedFare).toBe(70);
  });

  it('parses a completed request whose driver has no phone or plate', () => {
    const driver = { fullName: 'Ali', phone: null, truckType: 'flatbed', plateNumber: null };
    const parsed = towRequestSchema.parse({ ...base, status: 'completed', driver });
    expect(parsed.driver?.phone).toBeNull();
    expect(parsed.driver?.plateNumber).toBeNull();
    const bare = { fullName: 'Ali', truckType: 'flatbed' };
    expect(towRequestSchema.safeParse({ ...base, driver: bare }).success).toBe(true);
  });

  it('rejects a bad agreed fare or driver truck type', () => {
    expect(towRequestSchema.safeParse({ ...base, agreedFare: 7.5 }).success).toBe(false);
    expect(
      towRequestSchema.safeParse({
        ...base,
        driver: { fullName: 'Ali', phone: '1', truckType: 'rocket', plateNumber: 'x' },
      }).success,
    ).toBe(false);
  });
});

describe('towRequestSchema, trip', () => {
  const base = {
    id: '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f',
    status: 'assigned',
    pickup,
    dropoff,
    vehicleType: 'car',
    problemType: 'breakdown',
    distanceM: 12_000,
    suggestedFare: 64,
    proposedFare: 60,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
  };
  const seen = '2026-01-01T10:07:00.000Z';

  it('parses a Phase 3/4 payload without any trip field', () => {
    const parsed = towRequestSchema.parse(base);
    expect(parsed.tripStage).toBeUndefined();
    expect(parsed.driverLocation).toBeUndefined();
    expect(parsed.etaMin).toBeUndefined();
  });

  it('parses null trip fields', () => {
    const parsed = towRequestSchema.parse({
      ...base,
      tripStage: null,
      enRouteAt: null,
      arrivedAt: null,
      towingAt: null,
      completedAt: null,
      cancelledBy: null,
      cancelReason: null,
      driverLocation: null,
      etaMin: null,
    });
    expect(parsed.tripStage).toBeNull();
  });

  it('parses a trip in progress', () => {
    const parsed = towRequestSchema.parse({
      ...base,
      tripStage: 'en_route',
      enRouteAt: '2026-01-01T10:06:00.000Z',
      driverLocation: { latitude: 36.81, longitude: 10.19, updatedAt: seen },
      etaMin: 5,
    });
    expect(parsed.tripStage).toBe('en_route');
    expect(parsed.driverLocation?.latitude).toBe(36.81);
    expect(parsed.etaMin).toBe(5);
  });

  it('parses a completed and a cancelled request', () => {
    const completed = towRequestSchema.parse({
      ...base,
      status: 'completed',
      completedAt: '2026-01-01T11:00:00.000Z',
    });
    expect(completed.status).toBe('completed');
    const cancelled = towRequestSchema.parse({
      ...base,
      status: 'cancelled',
      cancelledBy: 'driver',
      cancelReason: 'unsafe',
    });
    expect(cancelled.cancelledBy).toBe('driver');
    expect(cancelled.cancelReason).toBe('unsafe');
  });

  it.each([
    ['an unknown stage', { tripStage: 'completed' }],
    ['an unknown canceller', { cancelledBy: 'admin' }],
    ['a driver location without a time', { driverLocation: { latitude: 36.8, longitude: 10.2 } }],
    [
      'a driver location outside Tunisia',
      { driverLocation: { latitude: 0, longitude: 0, updatedAt: seen } },
    ],
    ['a zero ETA', { etaMin: 0 }],
  ])('rejects %s', (_name, patch) => {
    expect(towRequestSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe('towRequestSchema, payment', () => {
  const request = {
    ...input,
    id: '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10',
    status: 'completed',
    distanceM: 12_345,
    suggestedFare: 65,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
  };
  const payment = { status: 'driver_confirmed', amountTnd: 60, receiptNo: 'DPN-2026-000123' };

  it('still parses Phase 3-5 payloads without payment', () => {
    expect(towRequestSchema.parse(request).payment).toBeUndefined();
    expect(towRequestSchema.parse({ ...request, payment: null }).payment).toBeNull();
  });

  it('parses a payment summary and strips the rest of the payment', () => {
    const parsed = towRequestSchema.parse({
      ...request,
      payment: { ...payment, method: 'cash', disputeNote: 'secret' },
    });
    expect(parsed.payment).toEqual(payment);
  });

  it('rejects a malformed summary', () => {
    expect(
      towRequestSchema.safeParse({ ...request, payment: { ...payment, receiptNo: 'x' } }).success,
    ).toBe(false);
    expect(towRequestSchema.safeParse({ ...request, payment: { status: 'paid' } }).success).toBe(
      false,
    );
  });
});
