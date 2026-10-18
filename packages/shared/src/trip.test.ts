import { describe, expect, it } from 'vitest';

import { estimateRoadDistanceM, etaMinutes } from './fare';
import type { TowRequestStatus, TripStage } from './tow-request';
import {
  cancelInputSchema,
  canCustomerCancel,
  canDriverCancel,
  etaTo,
  jobStageInputSchema,
  nextTripStage,
} from './trip';

describe('nextTripStage', () => {
  it.each([
    ['accepted', 'en_route'],
    ['en_route', 'arrived'],
    ['arrived', 'towing'],
    ['towing', null],
  ] as const)('%s -> %s', (stage, next) => {
    expect(nextTripStage(stage)).toBe(next);
  });
});

describe('canCustomerCancel', () => {
  it('is free for an open request', () => {
    expect(canCustomerCancel({ status: 'open' })).toBe('free');
  });

  it.each([
    ['accepted', 'free'],
    ['en_route', 'free'],
    ['arrived', 'with_reason'],
    ['towing', 'no'],
  ] as const)('at %s of an assigned request: %s', (tripStage, rule) => {
    expect(canCustomerCancel({ status: 'assigned', tripStage })).toBe(rule);
  });

  it('treats an assigned request without a stage as accepted', () => {
    expect(canCustomerCancel({ status: 'assigned' })).toBe('free');
    expect(canCustomerCancel({ status: 'assigned', tripStage: null })).toBe('free');
  });

  it.each(['completed', 'cancelled', 'expired'] as TowRequestStatus[])(
    'is no once %s',
    (status) => {
      expect(canCustomerCancel({ status })).toBe('no');
    },
  );
});

describe('canDriverCancel', () => {
  it.each([
    ['accepted', 'with_reason'],
    ['en_route', 'with_reason'],
    ['arrived', 'with_reason'],
    ['towing', 'no'],
  ] as [TripStage, string][])('at %s: %s', (tripStage, rule) => {
    expect(canDriverCancel({ status: 'assigned', tripStage })).toBe(rule);
  });

  it('treats a job without a stage as accepted', () => {
    expect(canDriverCancel({ status: 'assigned' })).toBe('with_reason');
  });

  it.each(['open', 'completed', 'cancelled', 'expired'] as TowRequestStatus[])(
    'is no for a %s request',
    (status) => {
      expect(canDriverCancel({ status })).toBe('no');
    },
  );
});

describe('cancelInputSchema', () => {
  it('allows no reason', () => {
    expect(cancelInputSchema.parse({})).toEqual({});
  });

  it.each([
    'driver_late',
    'problem_solved',
    'found_other_help',
    'unsafe',
    'truck_problem',
    'other',
  ])('accepts %s', (reason) => {
    expect(cancelInputSchema.parse({ reason }).reason).toBe(reason);
  });

  it('rejects an unknown reason', () => {
    expect(cancelInputSchema.safeParse({ reason: 'bored' }).success).toBe(false);
  });
});

describe('jobStageInputSchema', () => {
  it.each(['en_route', 'arrived', 'towing'])('accepts %s', (stage) => {
    expect(jobStageInputSchema.parse({ stage }).stage).toBe(stage);
  });

  it.each(['accepted', 'completed', 'flying'])('rejects %s', (stage) => {
    expect(jobStageInputSchema.safeParse({ stage }).success).toBe(false);
  });
});

describe('etaTo', () => {
  const from = { latitude: 36.8, longitude: 10.18 };
  const target = { latitude: 36.85, longitude: 10.3 };

  it('uses the road-adjusted distance at the driver speed', () => {
    expect(etaTo(target, from)).toBe(etaMinutes(estimateRoadDistanceM(from, target)));
    expect(etaTo(target, from)).toBeGreaterThan(1);
  });

  it('is at least one minute', () => {
    expect(etaTo(from, from)).toBe(1);
  });
});
