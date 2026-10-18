import { describe, expect, it } from 'vitest';

import { driverPresenceInputSchema, driverPresenceSchema } from './presence';

describe('driverPresenceInputSchema', () => {
  it('accepts going online with a location in Tunisia', () => {
    const parsed = driverPresenceInputSchema.parse({
      online: true,
      location: { latitude: 36.8, longitude: 10.18 },
    });
    expect(parsed.location?.latitude).toBe(36.8);
  });

  it('accepts going offline without a location', () => {
    expect(driverPresenceInputSchema.safeParse({ online: false }).success).toBe(true);
  });

  it('rejects a location outside Tunisia and a missing flag', () => {
    expect(
      driverPresenceInputSchema.safeParse({
        online: true,
        location: { latitude: 48.85, longitude: 2.35 },
      }).success,
    ).toBe(false);
    expect(driverPresenceInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('driverPresenceSchema', () => {
  it('parses an offline presence with no location', () => {
    expect(
      driverPresenceSchema.safeParse({ online: false, location: null, locationUpdatedAt: null })
        .success,
    ).toBe(true);
  });

  it('parses an online presence', () => {
    expect(
      driverPresenceSchema.safeParse({
        online: true,
        location: { latitude: 36.8, longitude: 10.18 },
        locationUpdatedAt: '2026-01-01T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
