import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Text } from 'react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { ActiveRequestScreen } from './ActiveRequestScreen';
import { RequestFlowProvider } from './RequestFlowContext';
import { requestStrings as t } from './strings';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: 'pk.test', apiUrl: 'http://api.test', environment: 'dev' },
}));
// Shows the markers it was given so the tests can see what moved.
jest.mock('@/features/map/TunisMap', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    TunisMap: ({ markers, fitToMarkers }: { markers: unknown[]; fitToMarkers: boolean }) => (
      <MockText testID="map">{JSON.stringify({ markers, fitToMarkers })}</MockText>
    ),
  };
});

const pickup = { latitude: 36.8, longitude: 10.18, address: 'Avenue Habib Bourguiba, Tunis' };
const dropoff = { latitude: 36.88, longitude: 10.32, address: 'La Marsa' };
const ID = '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10';
const assigned = {
  id: ID,
  status: 'assigned',
  pickup,
  dropoff,
  vehicleType: 'car',
  problemType: 'battery',
  note: null,
  distanceM: 12_400,
  suggestedFare: 65,
  proposedFare: 70,
  agreedFare: 75,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
  assignedAt: '2026-01-01T10:04:00.000Z',
  tripStage: 'accepted',
  driver: {
    fullName: 'Ali Ben Salah',
    phone: '+21620123456',
    truckType: 'wheel_lift',
    plateNumber: '123 TU 4567',
  },
};
const truckAt = (latitude: number) => ({
  latitude,
  longitude: 10.2,
  updatedAt: '2026-01-01T10:05:00.000Z',
});

let active: unknown;
let cancelBodies: unknown[];
let cancelStatus: number;

function mockApi() {
  cancelBodies = [];
  cancelStatus = 200;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const { pathname } = new URL(input.toString());
    if (pathname === '/tow-requests/active') {
      return active === null ? new Response(null, { status: 204 }) : Response.json(active);
    }
    if (pathname === `/tow-requests/${ID}/cancel`) {
      cancelBodies.push(init?.body ? JSON.parse(init.body as string) : undefined);
      if (cancelStatus !== 200) return new Response(null, { status: cancelStatus });
      const cancelled = { ...(active as object), status: 'cancelled' };
      active = null;
      return Response.json(cancelled);
    }
    return new Response(null, { status: 404 });
  });
}

function renderScreen() {
  const queryClient = createTestQueryClient();
  return renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <RequestFlowProvider>
            <Slot />
          </RequestFlowProvider>
        </QueryClientProvider>
      ),
      index: () => <Text>Home</Text>,
      'request/active': ActiveRequestScreen,
    },
    { initialUrl: '/request/active' },
  );
}

const markers = () => JSON.parse(screen.getByTestId('map').props.children).markers;
const activeCalls = () =>
  jest.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/active')).length;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(Date.parse('2026-01-01T10:05:00.000Z'));
  mockApi();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('assigned trip', () => {
  it('shows the pickup and the truck, and moves the truck as the position updates', async () => {
    active = { ...assigned, tripStage: 'en_route', driverLocation: truckAt(36.7), etaMin: 12 };
    await renderScreen();

    await screen.findByTestId('map');
    expect(JSON.parse(screen.getByTestId('map').props.children).fitToMarkers).toBe(true);
    expect(markers()).toEqual([
      { id: 'pickup', kind: 'pickup', coordinate: pickup },
      { id: 'truck', kind: 'truck', coordinate: expect.objectContaining({ latitude: 36.7 }) },
    ]);

    active = { ...assigned, tripStage: 'en_route', driverLocation: truckAt(36.75), etaMin: 9 };
    await act(async () => jest.advanceTimersByTime(10_000));

    await waitFor(() => expect(markers()[1].coordinate.latitude).toBe(36.75));
    expect(screen.getByText('Arriving in ~9 min')).toBeOnTheScreen();
  });

  it('polls every 10 seconds while assigned', async () => {
    active = assigned;
    await renderScreen();
    await screen.findByText('Driver assigned');
    const before = activeCalls();

    await act(async () => jest.advanceTimersByTime(10_000));

    await waitFor(() => expect(activeCalls()).toBe(before + 1));
  });

  it('shows the pickup and drop-off only when the truck position is unknown', async () => {
    active = { ...assigned, driverLocation: null };
    await renderScreen();

    await screen.findByTestId('map');
    expect(markers().map((m: { id: string }) => m.id)).toEqual(['pickup']);
  });

  it('shows the ETA to the pickup, none on arrival, and to the drop-off while towing', async () => {
    active = { ...assigned, tripStage: 'en_route', etaMin: 7 };
    await renderScreen();
    expect(await screen.findByText('Arriving in ~7 min')).toBeOnTheScreen();
    expect(screen.getByText('Your driver is on the way')).toBeOnTheScreen();

    active = { ...assigned, tripStage: 'arrived', arrivedAt: '2026-01-01T10:20:00.000Z' };
    await act(async () => jest.advanceTimersByTime(10_000));
    expect(await screen.findByText('Your driver has arrived')).toBeOnTheScreen();
    expect(screen.queryByText(/Arriving in/)).toBeNull();

    active = {
      ...assigned,
      tripStage: 'towing',
      towingAt: '2026-01-01T10:25:00.000Z',
      driverLocation: truckAt(36.85),
      etaMin: 14,
    };
    await act(async () => jest.advanceTimersByTime(10_000));
    expect(await screen.findByText('14 min to drop-off')).toBeOnTheScreen();
    expect(markers().map((m: { id: string }) => m.id)).toEqual(['dropoff', 'truck']);
  });

  it('lists the stages reached with their times', async () => {
    const enRouteAt = '2026-01-01T10:05:00.000Z';
    active = { ...assigned, tripStage: 'en_route', enRouteAt };
    await renderScreen();

    await screen.findByText('Your driver is on the way');
    for (const label of ['Accepted', 'On the way', 'Arrived', 'Towing']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.getByText(t.time(assigned.assignedAt))).toBeOnTheScreen();
    expect(screen.getByText(t.time(enRouteAt))).toBeOnTheScreen();
    expect(screen.getAllByText('–')).toHaveLength(2);
  });
});

describe('cancelling an assigned trip', () => {
  const confirmCancel = async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel request' }));
    return alert;
  };

  it('is free before the driver arrives, with no reason picker', async () => {
    active = { ...assigned, tripStage: 'en_route' };
    await renderScreen();
    await screen.findByText('Driver assigned');
    expect(screen.queryByText('Why are you cancelling?')).toBeNull();

    const alert = await confirmCancel();
    await act(async () =>
      alert.mock.calls[0]![2]!.find((b) => b.text === 'Cancel request')!.onPress!(),
    );

    await waitFor(() => expect(cancelBodies).toEqual([undefined]));
  });

  it('needs a reason once the driver has arrived, and sends it', async () => {
    active = { ...assigned, tripStage: 'arrived', arrivedAt: '2026-01-01T10:20:00.000Z' };
    const router = await renderScreen();
    await screen.findByText('Why are you cancelling?');

    const alert = await confirmCancel();
    expect(await screen.findByText('Pick a reason to cancel.')).toBeOnTheScreen();
    expect(alert).not.toHaveBeenCalled();
    expect(cancelBodies).toEqual([]);

    await fireEvent.press(screen.getByRole('radio', { name: 'Problem solved' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel request' }));
    await act(async () =>
      alert.mock.calls[0]![2]!.find((b) => b.text === 'Cancel request')!.onPress!(),
    );

    await waitFor(() => expect(cancelBodies).toEqual([{ reason: 'problem_solved' }]));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
  });

  it('is hidden once towing, with a line saying why', async () => {
    active = { ...assigned, tripStage: 'towing', towingAt: '2026-01-01T10:25:00.000Z' };
    await renderScreen();

    expect(await screen.findByText(t.cancelUnavailable)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull();
  });

  it('says so on a 409', async () => {
    active = { ...assigned, tripStage: 'en_route' };
    cancelStatus = 409;
    await renderScreen();
    await screen.findByText('Driver assigned');

    const alert = await confirmCancel();
    await act(async () =>
      alert.mock.calls[0]![2]!.find((b) => b.text === 'Cancel request')!.onPress!(),
    );

    expect(await screen.findByText(t.cancelConflict)).toBeOnTheScreen();
  });
});

describe('completed trip', () => {
  const completed = {
    ...assigned,
    status: 'completed',
    tripStage: 'towing',
    enRouteAt: '2026-01-01T10:05:00.000Z',
    arrivedAt: '2026-01-01T10:20:00.000Z',
    towingAt: '2026-01-01T10:25:00.000Z',
    completedAt: '2026-01-01T10:40:00.000Z',
    driver: undefined,
  };

  it('shows the summary with the driver seen while assigned, and Done goes home', async () => {
    active = assigned;
    const router = await renderScreen();
    await screen.findByText('Driver assigned');

    active = completed;
    await act(async () => jest.advanceTimersByTime(10_000));

    expect(await screen.findByText('Trip complete')).toBeOnTheScreen();
    expect(screen.getByText('Avenue Habib Bourguiba, Tunis')).toBeOnTheScreen();
    expect(screen.getByText('La Marsa')).toBeOnTheScreen();
    expect(screen.getByText('Ali Ben Salah')).toBeOnTheScreen();
    expect(await screen.findByText('75 TND')).toBeOnTheScreen();
    expect(screen.getByText(t.time(completed.completedAt))).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.getPathname()).toBe('/');
  });

  it('shows the summary without a driver name when opened fresh', async () => {
    active = completed;
    await renderScreen();

    expect(await screen.findByText('Trip complete')).toBeOnTheScreen();
    expect(screen.queryByText('Driver')).toBeNull();
  });
});
