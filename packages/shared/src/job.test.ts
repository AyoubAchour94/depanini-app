import { describe, expect, it } from 'vitest';

import { driverJobSchema, driverJobsPageSchema, earningsSchema } from './job';

const job = {
  id: '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f',
  status: 'assigned',
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Tunis' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  vehicleType: 'suv_van',
  problemType: 'accident',
  distanceM: 12_000,
  suggestedFare: 80,
  proposedFare: 75,
  agreedFare: 78,
  assignedAt: '2026-01-01T10:05:00.000Z',
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
  customer: { fullName: 'Sami', phone: '+21622123456' },
};

describe('driverJobSchema', () => {
  it('parses an assigned request with the customer contact', () => {
    const parsed = driverJobSchema.parse(job);
    expect(parsed.customer.phone).toBe('+21622123456');
    expect(parsed.agreedFare).toBe(78);
  });

  it.each([
    ['no customer', { customer: undefined }],
    ['no agreed fare', { agreedFare: undefined }],
    ['an open status', { status: 'open' }],
  ])('rejects %s', (_name, patch) => {
    expect(driverJobSchema.safeParse({ ...job, ...patch }).success).toBe(false);
  });

  it('parses a Phase 4 job without a stage', () => {
    expect(driverJobSchema.parse(job).tripStage).toBeUndefined();
  });

  it('parses the stage and its timestamps', () => {
    const parsed = driverJobSchema.parse({
      ...job,
      tripStage: 'arrived',
      enRouteAt: '2026-01-01T10:06:00.000Z',
      arrivedAt: '2026-01-01T10:12:00.000Z',
    });
    expect(parsed.tripStage).toBe('arrived');
    expect(parsed.arrivedAt).toBe('2026-01-01T10:12:00.000Z');
  });

  it('rejects an unknown stage and a completed status', () => {
    expect(driverJobSchema.safeParse({ ...job, tripStage: 'flying' }).success).toBe(false);
    expect(driverJobSchema.safeParse({ ...job, status: 'completed' }).success).toBe(false);
  });
});

describe('driverJobsPageSchema', () => {
  const base = {
    id: '3f0c3a1e-2b1d-4a55-9a43-6f1f6f0f7a11',
    status: 'completed',
    pickup: { latitude: 36.8, longitude: 10.18, address: 'Tunis' },
    dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
    vehicleType: 'car',
    problemType: 'breakdown',
    distanceM: 12000,
    suggestedFare: 60,
    proposedFare: 60,
    expiresAt: '2026-10-19T10:00:00.000Z',
    createdAt: '2026-10-19T09:00:00.000Z',
  };

  it('parses a page of completed and cancelled jobs', () => {
    const page = driverJobsPageSchema.parse({
      items: [
        {
          ...base,
          payment: { status: 'driver_confirmed', amountTnd: 85, receiptNo: 'DPN-2026-000123' },
        },
        { ...base, status: 'cancelled', cancelledBy: 'driver' },
      ],
      nextCursor: 'abc',
    });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.payment?.receiptNo).toBe('DPN-2026-000123');
    expect(page.items[1]?.payment).toBeUndefined();
  });

  it('accepts an empty last page and rejects a missing cursor or bad item', () => {
    expect(driverJobsPageSchema.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(driverJobsPageSchema.safeParse({ items: [] }).success).toBe(false);
    expect(driverJobsPageSchema.safeParse({ items: [{ id: 'x' }], nextCursor: null }).success).toBe(
      false,
    );
  });
});

describe('earningsSchema', () => {
  const period = { trips: 2, totalTnd: 170 };

  it('parses today, week and month', () => {
    const earnings = { today: period, week: period, month: { trips: 0, totalTnd: 0 } };
    expect(earningsSchema.parse(earnings)).toEqual(earnings);
  });

  it.each([
    ['negative trips', { trips: -1, totalTnd: 0 }],
    ['fractional trips', { trips: 1.5, totalTnd: 0 }],
    ['negative total', { trips: 0, totalTnd: -1 }],
    ['fractional total', { trips: 1, totalTnd: 10.5 }],
    ['missing total', { trips: 1 }],
  ])('rejects %s', (_name, bad) => {
    expect(earningsSchema.safeParse({ today: bad, week: period, month: period }).success).toBe(
      false,
    );
  });

  it('rejects a missing period', () => {
    expect(earningsSchema.safeParse({ today: period, week: period }).success).toBe(false);
  });
});
