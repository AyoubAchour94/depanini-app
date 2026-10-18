import { describe, expect, it } from 'vitest';

import { wsClientMessageSchema, wsServerMessageSchema } from './realtime';

const id = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const request = {
  id,
  status: 'assigned',
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Tunis' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  vehicleType: 'car',
  problemType: 'breakdown',
  distanceM: 12_000,
  suggestedFare: 80,
  proposedFare: 75,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
};
const offer = {
  id,
  requestId: id,
  fare: 78,
  etaMin: 6,
  distanceToPickupM: 2000,
  status: 'accepted',
  expiresAt: '2026-01-01T10:03:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
};

describe('wsClientMessageSchema', () => {
  it('parses auth', () => {
    expect(wsClientMessageSchema.parse({ type: 'auth', token: 'abc' })).toEqual({
      type: 'auth',
      token: 'abc',
    });
  });

  it.each([
    ['an empty token', { type: 'auth', token: '' }],
    ['no token', { type: 'auth' }],
    ['an unknown type', { type: 'ping' }],
  ])('rejects %s', (_name, message) => {
    expect(wsClientMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('wsServerMessageSchema', () => {
  it('parses auth.ok and auth.error', () => {
    expect(wsServerMessageSchema.parse({ type: 'auth.ok' })).toEqual({ type: 'auth.ok' });
    expect(wsServerMessageSchema.parse({ type: 'auth.error' }).type).toBe('auth.error');
    expect(wsServerMessageSchema.parse({ type: 'auth.error', message: 'bad token' })).toEqual({
      type: 'auth.error',
      message: 'bad token',
    });
  });

  it('parses request.updated with a request', () => {
    const parsed = wsServerMessageSchema.parse({
      type: 'request.updated',
      request: { ...request, tripStage: 'en_route' },
    });
    expect(parsed.type === 'request.updated' && parsed.request.tripStage).toBe('en_route');
  });

  it('keeps the customer contact on a job', () => {
    const parsed = wsServerMessageSchema.parse({
      type: 'request.updated',
      request: {
        ...request,
        agreedFare: 78,
        assignedAt: '2026-01-01T10:05:00.000Z',
        customer: { fullName: 'Sami', phone: '+21622123456' },
      },
    });
    expect(parsed.type === 'request.updated' && 'customer' in parsed.request).toBe(true);
  });

  it('parses offer.updated, keeping the driver when present', () => {
    expect(wsServerMessageSchema.parse({ type: 'offer.updated', offer }).type).toBe(
      'offer.updated',
    );
    const withDriver = wsServerMessageSchema.parse({
      type: 'offer.updated',
      offer: { ...offer, driver: { fullName: 'Ali', truckType: 'flatbed' } },
    });
    expect(withDriver.type === 'offer.updated' && 'driver' in withDriver.offer).toBe(true);
  });

  it('parses driver.location', () => {
    const message = {
      type: 'driver.location',
      requestId: id,
      location: { latitude: 36.81, longitude: 10.19 },
      etaMin: 4,
    };
    expect(wsServerMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    ['an unknown type', { type: 'nope' }],
    ['a request.updated without a request', { type: 'request.updated' }],
    [
      'a driver.location outside Tunisia',
      {
        type: 'driver.location',
        requestId: id,
        location: { latitude: 0, longitude: 0 },
        etaMin: 4,
      },
    ],
  ])('rejects %s', (_name, message) => {
    expect(wsServerMessageSchema.safeParse(message).success).toBe(false);
  });
});
