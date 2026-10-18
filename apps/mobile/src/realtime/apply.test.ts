import type { DriverJob, TowRequest } from '@depanini/shared';

import { JOB_KEY, OFFERS_KEY as DRIVER_OFFERS_KEY } from '@/api/driver';
import { ACTIVE_KEY, HISTORY_KEY, OFFERS_KEY } from '@/api/towRequests';
import { createTestQueryClient } from '@/test/queryClient';

import { applyRealtimeMessage } from './apply';

const ID = '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10';
const place = { latitude: 36.8, longitude: 10.18, address: 'Tunis' };
const base = {
  id: ID,
  status: 'assigned',
  pickup: place,
  dropoff: { ...place, address: 'La Marsa' },
  vehicleType: 'car',
  problemType: 'battery',
  distanceM: 12_400,
  suggestedFare: 65,
  proposedFare: 70,
  agreedFare: 75,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
  assignedAt: '2026-01-01T10:04:00.000Z',
  tripStage: 'accepted',
} as const;
const request = base as unknown as TowRequest;
const job = { ...base, customer: { fullName: 'Sami', phone: '+21620123456' } } as DriverJob;

function setup() {
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const invalidated = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { queryClient, invalidated };
}

describe('request.updated', () => {
  it('replaces the customer active request and refreshes history and offers', () => {
    const { queryClient, invalidated } = setup();
    queryClient.setQueryData(ACTIVE_KEY, { ...request, status: 'open' });
    applyRealtimeMessage(queryClient, { type: 'request.updated', request }, 'customer');
    expect(queryClient.getQueryData(ACTIVE_KEY)).toEqual(request);
    expect(invalidated()).toEqual(expect.arrayContaining([HISTORY_KEY, OFFERS_KEY]));
  });

  it('keeps a newer open request when an older one ends late', () => {
    const { queryClient } = setup();
    const open = { ...request, id: '1b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f11', status: 'open' };
    queryClient.setQueryData(ACTIVE_KEY, open);
    applyRealtimeMessage(
      queryClient,
      { type: 'request.updated', request: { ...request, status: 'cancelled' } },
      'customer',
    );
    expect(queryClient.getQueryData(ACTIVE_KEY)).toEqual(open);
  });

  it('ignores a driver-shaped push in the customer app', () => {
    const { queryClient, invalidated } = setup();
    const own = { ...request, id: '4b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f14', status: 'open' };
    queryClient.setQueryData(ACTIVE_KEY, own);
    applyRealtimeMessage(queryClient, { type: 'request.updated', request: job }, 'customer');
    expect(queryClient.getQueryData(ACTIVE_KEY)).toEqual(own);
    expect(invalidated()).toEqual([]);
  });

  it('keeps the driver job when a customer-shaped push is for another request', () => {
    const { queryClient } = setup();
    queryClient.setQueryData(JOB_KEY, job);
    const id = '5b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f15';
    applyRealtimeMessage(
      queryClient,
      { type: 'request.updated', request: { ...request, id, status: 'cancelled' } },
      'driver',
    );
    expect(queryClient.getQueryData(ACTIVE_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(JOB_KEY)).toEqual(job);
    applyRealtimeMessage(
      queryClient,
      { type: 'request.updated', request: { ...request, id } },
      'driver',
    );
    expect(queryClient.getQueryData(JOB_KEY)).toEqual(job);
  });

  it('sets the driver job while assigned', () => {
    const { queryClient } = setup();
    applyRealtimeMessage(queryClient, { type: 'request.updated', request: job }, 'driver');
    expect(queryClient.getQueryData(JOB_KEY)).toEqual(job);
  });

  it.each(['cancelled', 'completed'] as const)('clears the driver job when %s', (status) => {
    const { queryClient } = setup();
    queryClient.setQueryData(JOB_KEY, job);
    applyRealtimeMessage(
      queryClient,
      { type: 'request.updated', request: { ...request, status } },
      'driver',
    );
    expect(queryClient.getQueryData(JOB_KEY)).toBeNull();
  });
});

describe('offer.updated', () => {
  const offer = {
    id: '2b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f12',
    requestId: ID,
    fare: 70,
    etaMin: 5,
    distanceToPickupM: 2000,
    status: 'pending',
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
  } as const;

  it('refreshes the driver offers for a driver', () => {
    const { queryClient, invalidated } = setup();
    applyRealtimeMessage(queryClient, { type: 'offer.updated', offer }, 'driver');
    expect(invalidated()).toEqual([DRIVER_OFFERS_KEY]);
  });

  it('refreshes the offers for a customer', () => {
    const { queryClient, invalidated } = setup();
    applyRealtimeMessage(queryClient, { type: 'offer.updated', offer }, 'customer');
    expect(invalidated()).toEqual([OFFERS_KEY]);
  });
});

describe('driver.location', () => {
  const message = {
    type: 'driver.location',
    requestId: ID,
    location: { latitude: 36.81, longitude: 10.19 },
    etaMin: 3,
  } as const;

  it('patches the truck position and ETA of the active request', () => {
    const { queryClient } = setup();
    queryClient.setQueryData(ACTIVE_KEY, request);
    applyRealtimeMessage(queryClient, message, 'customer');
    expect(queryClient.getQueryData<TowRequest>(ACTIVE_KEY)).toMatchObject({
      etaMin: 3,
      driverLocation: { latitude: 36.81, longitude: 10.19 },
    });
  });

  it('ignores another request or an empty cache', () => {
    const { queryClient } = setup();
    applyRealtimeMessage(queryClient, message, 'customer');
    expect(queryClient.getQueryData(ACTIVE_KEY)).toBeUndefined();
    queryClient.setQueryData(ACTIVE_KEY, {
      ...request,
      id: '3b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f13',
    });
    applyRealtimeMessage(queryClient, message, 'customer');
    expect(queryClient.getQueryData<TowRequest>(ACTIVE_KEY)?.etaMin).toBeUndefined();
  });
});
