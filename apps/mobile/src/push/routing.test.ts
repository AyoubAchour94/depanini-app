import { PUSH_KINDS, type PushData } from '@depanini/shared';

import { pushRoute, type PushRouteContext } from './routing';

const requestId = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';
const offerId = '0f3d9a52-8c1e-4b7a-a2d4-6e5f4c3b2a10';

const driver = (overrides: Partial<PushRouteContext> = {}): PushRouteContext => ({
  isDriverApp: true,
  hasNearbyRequest: () => false,
  hasJob: false,
  ...overrides,
});
const customer: PushRouteContext = { ...driver(), isDriverApp: false };
const data = (kind: PushData['kind'], extra: Partial<PushData> = {}): PushData => ({
  kind,
  requestId,
  ...extra,
});

describe('customer app', () => {
  it.each(['offer_received', 'trip_stage', 'trip_cancelled', 'trip_completed'] as const)(
    'opens the active request for %s',
    (kind) => {
      expect(pushRoute(data(kind), customer)).toBe('/request/active');
    },
  );

  it.each(['nearby_request', 'offer_accepted', 'offer_rejected', 'offer_expired'] as const)(
    'has no screen for the driver kind %s',
    (kind) => {
      expect(pushRoute(data(kind), customer)).toBeNull();
    },
  );
});

describe('driver app', () => {
  it('opens a nearby request that is in the cache', () => {
    expect(
      pushRoute(data('nearby_request'), driver({ hasNearbyRequest: (id) => id === requestId })),
    ).toEqual({ pathname: '/job-offer/[id]', params: { id: requestId } });
  });

  it('goes home for a nearby request that is not in the cache', () => {
    expect(pushRoute(data('nearby_request'), driver())).toBe('/');
  });

  it('opens the job once an offer is accepted', () => {
    expect(pushRoute(data('offer_accepted', { offerId }), driver())).toBe('/job');
  });

  it.each(['offer_rejected', 'offer_expired'] as const)('goes home for %s', (kind) => {
    expect(pushRoute(data(kind, { offerId }), driver())).toBe('/');
  });

  it('opens the job when the customer cancels an assigned trip', () => {
    expect(pushRoute(data('trip_cancelled'), driver({ hasJob: true }))).toBe('/job');
  });

  it('goes home with a notice when an open request under an offer was cancelled', () => {
    expect(pushRoute(data('trip_cancelled', { offerId }), driver())).toEqual({
      pathname: '/',
      params: { notice: 'request-cancelled' },
    });
  });

  it('opens the job for a cancel that carries an offer when the driver has a job', () => {
    expect(pushRoute(data('trip_cancelled', { offerId }), driver({ hasJob: true }))).toBe('/job');
  });

  it('opens the finished job for a payment answer', () => {
    expect(pushRoute(data('payment_answered'), driver())).toEqual({
      pathname: '/jobs/[id]',
      params: { id: requestId },
    });
  });

  it.each(['verification_approved', 'verification_rejected'] as const)(
    'opens the verification screen for %s',
    (kind) => {
      expect(pushRoute({ kind }, driver())).toBe('/verification');
    },
  );

  it.each(['offer_received', 'trip_stage', 'trip_completed'] as const)(
    'has no screen for the customer kind %s',
    (kind) => {
      expect(pushRoute(data(kind), driver())).toBeNull();
    },
  );

  it('every push kind opens something in one of the apps', () => {
    for (const kind of PUSH_KINDS) {
      const results = [pushRoute(data(kind), driver()), pushRoute(data(kind), customer)];
      expect(results.some((route) => route !== null)).toBe(true);
    }
  });
});
