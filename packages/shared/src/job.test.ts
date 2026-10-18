import { describe, expect, it } from 'vitest';

import { driverJobSchema } from './job';

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
