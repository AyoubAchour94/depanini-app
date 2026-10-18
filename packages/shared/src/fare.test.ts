import { describe, expect, it } from 'vitest';

import {
  DRIVER_SPEED_KMH,
  estimateRoadDistanceM,
  etaMinutes,
  fareBounds,
  haversineM,
  isFareAllowed,
  NEARBY_RADIUS_M,
  OFFER_TTL_MS,
  PRESENCE_STALE_MS,
  ROAD_FACTOR,
  suggestFare,
} from './fare';
import { TUNIS_CENTER } from './geo';

describe('suggestFare', () => {
  it.each([
    ['car', 0, 40],
    ['car', 10_000, 60],
    ['suv_van', 10_000, 75],
    ['motorcycle', 10_000, 45],
  ] as const)('%s at %i m is %i TND', (vehicleType, distanceM, fare) => {
    expect(suggestFare(distanceM, vehicleType)).toBe(fare);
  });

  it('rounds to whole dinars', () => {
    expect(suggestFare(3_000, 'suv_van')).toBe(58); // 57.5
    expect(suggestFare(1_100, 'car')).toBe(42); // 42.2
    expect(suggestFare(1_300, 'motorcycle')).toBe(32); // 31.95
  });
});

describe('fareBounds', () => {
  it('is 80% (rounded up) to 3x', () => {
    expect(fareBounds(100)).toEqual({ min: 80, max: 300 });
    expect(fareBounds(57)).toEqual({ min: 46, max: 171 }); // 45.6 -> 46
  });
});

describe('isFareAllowed', () => {
  it('allows whole dinars within the bounds, inclusive', () => {
    expect(isFareAllowed(80, 100)).toBe(true);
    expect(isFareAllowed(300, 100)).toBe(true);
  });

  it('rejects fares outside the bounds or not whole', () => {
    expect(isFareAllowed(79, 100)).toBe(false);
    expect(isFareAllowed(301, 100)).toBe(false);
    expect(isFareAllowed(90.5, 100)).toBe(false);
  });
});

describe('haversineM', () => {
  it('is 0 for the same point', () => {
    expect(haversineM(TUNIS_CENTER, TUNIS_CENTER)).toBe(0);
  });

  it('matches a known distance (Tunis to Sfax, about 235 km)', () => {
    const sfax = { latitude: 34.7406, longitude: 10.7603 };
    expect(haversineM(TUNIS_CENTER, sfax) / 1000).toBeCloseTo(235, -1);
  });
});

describe('estimateRoadDistanceM', () => {
  it('scales the straight line by the road factor', () => {
    const b = { latitude: 36.9, longitude: 10.2 };
    expect(estimateRoadDistanceM(TUNIS_CENTER, b)).toBe(
      Math.round(haversineM(TUNIS_CENTER, b) * ROAD_FACTOR),
    );
  });
});

describe('etaMinutes', () => {
  it.each([
    [0, 1],
    [500, 1],
    [1_000, 2], // 1.5 min
    [10_000, 15],
    [13_100, 20], // 19.65 min
    [13_400, 21], // 20.1 min
  ])('%i m takes %i min', (distanceM, minutes) => {
    expect(etaMinutes(distanceM)).toBe(minutes);
  });
});

describe('phase 4 constants', () => {
  it('match the agreed values', () => {
    expect([NEARBY_RADIUS_M, OFFER_TTL_MS, DRIVER_SPEED_KMH, PRESENCE_STALE_MS]).toEqual([
      25_000, 180_000, 40, 120_000,
    ]);
  });
});
