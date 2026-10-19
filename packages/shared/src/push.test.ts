import { describe, expect, it } from 'vitest';

import { deviceInputSchema, devicePlatformSchema, PUSH_KINDS, pushDataSchema } from './push';

const requestId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const offerId = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';

describe('devicePlatformSchema', () => {
  it('accepts ios and android only', () => {
    expect(devicePlatformSchema.safeParse('ios').success).toBe(true);
    expect(devicePlatformSchema.safeParse('android').success).toBe(true);
    expect(devicePlatformSchema.safeParse('web').success).toBe(false);
  });
});

describe('deviceInputSchema', () => {
  const input = { token: 'abc', platform: 'ios', appVariant: 'user' };

  it('accepts a device', () => {
    expect(deviceInputSchema.parse(input)).toEqual(input);
    expect(deviceInputSchema.safeParse({ ...input, appVariant: 'driver' }).success).toBe(true);
  });

  it('bounds the token to 1..4096 characters', () => {
    expect(deviceInputSchema.safeParse({ ...input, token: '' }).success).toBe(false);
    expect(deviceInputSchema.safeParse({ ...input, token: 'a' }).success).toBe(true);
    expect(deviceInputSchema.safeParse({ ...input, token: 'a'.repeat(4096) }).success).toBe(true);
    expect(deviceInputSchema.safeParse({ ...input, token: 'a'.repeat(4097) }).success).toBe(false);
  });

  it('rejects a bad platform, variant or missing field', () => {
    expect(deviceInputSchema.safeParse({ ...input, platform: 'web' }).success).toBe(false);
    expect(deviceInputSchema.safeParse({ ...input, appVariant: 'admin' }).success).toBe(false);
    expect(deviceInputSchema.safeParse({ token: 'abc', platform: 'ios' }).success).toBe(false);
  });
});

describe('PUSH_KINDS', () => {
  it('lists the kinds', () => {
    expect([...PUSH_KINDS]).toEqual([
      'nearby_request',
      'offer_received',
      'offer_accepted',
      'offer_rejected',
      'offer_expired',
      'trip_stage',
      'trip_cancelled',
      'trip_completed',
      'payment_answered',
    ]);
  });
});

describe('pushDataSchema', () => {
  it('parses every kind', () => {
    for (const kind of PUSH_KINDS) {
      expect(pushDataSchema.parse({ kind, requestId }).kind).toBe(kind);
    }
  });

  it('carries an optional offer id', () => {
    expect(pushDataSchema.parse({ kind: 'offer_received', requestId, offerId }).offerId).toBe(
      offerId,
    );
    expect(pushDataSchema.parse({ kind: 'offer_received', requestId }).offerId).toBeUndefined();
  });

  it('rejects an unknown kind, a bad id or a missing request id', () => {
    expect(pushDataSchema.safeParse({ kind: 'spam', requestId }).success).toBe(false);
    expect(pushDataSchema.safeParse({ kind: 'trip_stage', requestId: 'nope' }).success).toBe(false);
    expect(pushDataSchema.safeParse({ kind: 'trip_stage' }).success).toBe(false);
    expect(
      pushDataSchema.safeParse({ kind: 'offer_received', requestId, offerId: 'nope' }).success,
    ).toBe(false);
  });
});
