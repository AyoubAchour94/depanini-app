import { describe, expect, it } from 'vitest';

import { receiptSchema } from './receipt';

const receipt = {
  receiptNo: 'DPN-2026-000123',
  completedAt: '2026-10-19T10:00:00.000Z',
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Tunis' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  distanceM: 12000,
  vehicleType: 'car',
  problemType: 'breakdown',
  agreedFare: 85,
  method: 'cash',
  assignedAt: '2026-10-19T09:00:00.000Z',
  enRouteAt: '2026-10-19T09:05:00.000Z',
  arrivedAt: '2026-10-19T09:20:00.000Z',
  towingAt: '2026-10-19T09:30:00.000Z',
  driver: { fullName: 'Sami Driver', truckType: 'flatbed' },
  customer: { fullName: 'Amel Customer' },
};

describe('receiptSchema', () => {
  it('parses a receipt', () => {
    expect(receiptSchema.parse(receipt)).toEqual(receipt);
  });

  it('allows missing stage times (jobs from before trips existed)', () => {
    const bare = {
      receiptNo: receipt.receiptNo,
      completedAt: receipt.completedAt,
      pickup: receipt.pickup,
      dropoff: receipt.dropoff,
      distanceM: receipt.distanceM,
      vehicleType: receipt.vehicleType,
      problemType: receipt.problemType,
      agreedFare: receipt.agreedFare,
      method: receipt.method,
      driver: receipt.driver,
      customer: receipt.customer,
    };
    expect(receiptSchema.safeParse(bare).success).toBe(true);
    expect(
      receiptSchema.safeParse({ ...bare, enRouteAt: null, arrivedAt: null, towingAt: null })
        .success,
    ).toBe(true);
  });

  it('strips phones and plates from every level', () => {
    const parsed = receiptSchema.parse({
      ...receipt,
      phone: '+21612345678',
      plateNumber: '123 TUN 4567',
      driver: { ...receipt.driver, phone: '+21612345678', plateNumber: '123 TUN 4567' },
      customer: { ...receipt.customer, phone: '+21698765432' },
    });
    expect(parsed).toEqual(receipt);
    expect(JSON.stringify(parsed)).not.toMatch(/phone|plate|\+216/i);
  });

  it.each([
    ['missing receipt number', { receiptNo: undefined }],
    ['bad receipt number', { receiptNo: 'nope' }],
    ['missing completedAt', { completedAt: undefined }],
    ['pickup outside Tunisia', { pickup: { latitude: 48.8, longitude: 2.3, address: 'Paris' } }],
    ['fractional fare', { agreedFare: 85.5 }],
    ['zero fare', { agreedFare: 0 }],
    ['negative distance', { distanceM: -1 }],
    ['unknown vehicle', { vehicleType: 'bus' }],
    ['unknown method', { method: 'card' }],
    ['missing driver', { driver: undefined }],
    ['unknown truck type', { driver: { fullName: 'X', truckType: 'crane' } }],
    ['missing customer', { customer: undefined }],
  ])('rejects %s', (_name, patch) => {
    expect(receiptSchema.safeParse({ ...receipt, ...patch }).success).toBe(false);
  });
});
