import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { DriverHome } from './DriverHome';
import { driverStrings as t } from './strings';
import { JobScreen } from './JobScreen';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('@/firebase/firebase', () => ({
  getFirebaseStatus: () => ({ configured: true }),
  getCurrentIdToken: async () => 'id-token',
}));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: 'pk.test', apiUrl: 'http://api.test', environment: 'dev' },
}));

const REQUEST_ID = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';

const baseJob = {
  id: REQUEST_ID,
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Avenue Bourguiba' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  vehicleType: 'car',
  problemType: 'battery',
  distanceM: 12_000,
  proposedFare: 60,
  suggestedFare: 64,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T09:55:00.000Z',
  status: 'assigned',
  agreedFare: 65,
  assignedAt: '2026-01-01T10:01:00.000Z',
  customer: { fullName: 'Sami Trabelsi', phone: '+21620123456' },
};

const STAGE_TIMES = {
  en_route: { enRouteAt: '2026-01-01T10:05:00.000Z' },
  arrived: { arrivedAt: '2026-01-01T10:20:00.000Z' },
  towing: { towingAt: '2026-01-01T10:25:00.000Z' },
} as const;

interface Server {
  job: Record<string, unknown> | null;
  /** Status to answer the next stage or complete call with (default 200). */
  failWith: number;
  /** When set, stage calls wait for it. */
  hold: Promise<void> | null;
}
let server: Server;
let view: Awaited<ReturnType<typeof renderRouter>>;

function mockApi() {
  const calls: { call: string; body?: unknown }[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ call: `${method} ${path}`, body });
    if (path === '/driver/presence') return Response.json({ online: false });
    if (path === '/driver/requests/nearby') return Response.json([]);
    if (path === '/driver/offers/active') return Response.json([]);
    if (path === '/driver/job' && method === 'GET') {
      return server.job ? Response.json(server.job) : new Response(null, { status: 204 });
    }
    if (path === '/driver/job/stage') {
      if (server.hold) await server.hold;
      if (server.failWith !== 200) return new Response('{}', { status: server.failWith });
      server.job = {
        ...server.job,
        tripStage: body.stage,
        ...STAGE_TIMES[body.stage as keyof typeof STAGE_TIMES],
      };
      return Response.json(server.job);
    }
    if (path === '/driver/job/complete') {
      if (server.failWith !== 200) return new Response('{}', { status: server.failWith });
      const done = {
        ...server.job,
        status: 'completed',
        tripStage: null,
        completedAt: '2026-01-01T10:40:00.000Z',
        payment: { status: 'driver_confirmed', amountTnd: 65, receiptNo: 'DPN-2026-000007' },
      };
      server.job = null;
      return Response.json(done);
    }
    if (path.endsWith('/cancel')) {
      server.job = null;
      return Response.json({ ...baseJob, status: 'cancelled' });
    }
    return new Response('{}', { status: 404 });
  });
  return { calls: (name: string) => calls.filter((c) => c.call === name) };
}

async function renderApp(initialUrl = '/job') {
  const queryClient = createTestQueryClient();
  view = await renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      ),
      index: DriverHome,
      job: JobScreen,
    },
    { initialUrl },
  );
}

const flush = () => act(async () => jest.advanceTimersByTime(0));
const press = async (name: string | RegExp) => {
  await act(async () => fireEvent.press(screen.getByRole('button', { name })));
  await flush();
};
const pickReason = (name: string) =>
  act(async () => fireEvent.press(screen.getByRole('radio', { name })));
const confirmWith = (button: 0 | 1) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.[button]?.onPress?.();
  });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  server = { job: { ...baseJob }, failWith: 200, hold: null };
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('trip steps', () => {
  it('walks the stages one primary button at a time', async () => {
    const api = mockApi();
    await renderApp();
    await flush();

    expect(await screen.findByRole('button', { name: 'Start driving' })).toBeOnTheScreen();
    await press('Start driving');
    expect(api.calls('POST /driver/job/stage')[0]?.body).toEqual({ stage: 'en_route' });
    expect(await screen.findByRole('button', { name: "I've arrived" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Start driving' })).toBeNull();
    expect(screen.getByText(t.time(STAGE_TIMES.en_route.enRouteAt))).toBeOnTheScreen();

    await press("I've arrived");
    expect(api.calls('POST /driver/job/stage')[1]?.body).toEqual({ stage: 'arrived' });
    expect(await screen.findByRole('button', { name: 'Vehicle loaded' })).toBeOnTheScreen();

    await press('Vehicle loaded');
    expect(api.calls('POST /driver/job/stage')[2]?.body).toEqual({ stage: 'towing' });
    expect(
      await screen.findByRole('button', { name: 'Dropped off · cash received 65 TND' }),
    ).toBeOnTheScreen();
    expect(screen.getByText(t.time(STAGE_TIMES.towing.towingAt))).toBeOnTheScreen();
  });

  it('marks the pickup before towing and the drop-off while towing', async () => {
    mockApi();
    await renderApp();
    await flush();
    expect(await screen.findByTestId('marker-pickup')).toBeOnTheScreen();
    expect(screen.queryByTestId('marker-dropoff')).toBeNull();

    server.job = { ...baseJob, tripStage: 'towing', ...STAGE_TIMES.towing };
    await act(async () => jest.advanceTimersByTime(10_000));
    await flush();
    expect(await screen.findByTestId('marker-dropoff')).toBeOnTheScreen();
    expect(screen.queryByTestId('marker-pickup')).toBeNull();
  });

  it('disables the button while the call is in flight', async () => {
    let release = () => {};
    server.hold = new Promise((resolve) => (release = resolve));
    const api = mockApi();
    await renderApp();
    await flush();

    await press('Start driving');
    // The spinner replaces the title while the call runs.
    const busy = screen.getByRole('button', { busy: true });
    expect(busy).toBeDisabled();
    await act(async () => fireEvent.press(busy));
    expect(api.calls('POST /driver/job/stage')).toHaveLength(1);

    await act(async () => release());
    await flush();
    expect(await screen.findByRole('button', { name: "I've arrived" })).toBeEnabled();
  });

  it('refetches the job and says so on a 409', async () => {
    const api = mockApi();
    await renderApp();
    await flush();

    // Another device already moved the job on.
    server.job = { ...baseJob, tripStage: 'arrived' };
    server.failWith = 409;
    const before = api.calls('GET /driver/job').length;
    await press('Start driving');
    await flush();

    expect(await screen.findByText(t.stageConflict)).toBeOnTheScreen();
    expect(api.calls('GET /driver/job').length).toBeGreaterThan(before);
    expect(await screen.findByRole('button', { name: 'Vehicle loaded' })).toBeOnTheScreen();
  });

  it('shows an error when a step fails otherwise', async () => {
    mockApi();
    server.failWith = 500;
    await renderApp();
    await flush();

    await press('Start driving');
    expect(await screen.findByText(t.stageFailed)).toBeOnTheScreen();
    expect(screen.queryByText(t.stageConflict)).toBeNull();
  });
});

describe('dropping off', () => {
  beforeEach(() => {
    server.job = { ...baseJob, tripStage: 'towing', ...STAGE_TIMES.towing };
  });

  it('asks first and keeps the job when declined', async () => {
    const api = mockApi();
    const alert = confirmWith(0);
    await renderApp();
    await flush();

    await press('Dropped off · cash received 65 TND');
    expect(alert).toHaveBeenCalledWith(
      t.confirmDropoffTitle,
      t.confirmDropoffMessage(65),
      expect.any(Array),
      expect.anything(),
    );
    expect(t.confirmDropoffMessage(65)).toContain('65 TND');
    expect(api.calls('POST /driver/job/complete')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Dropped off · cash received 65 TND' }),
    ).toBeOnTheScreen();
  });

  it('completes after confirming, shows the summary, and goes home from it', async () => {
    const api = mockApi();
    confirmWith(1);
    await renderApp();
    await flush();

    await press('Dropped off · cash received 65 TND');
    await flush();

    expect(api.calls('POST /driver/job/complete')).toHaveLength(1);
    expect(api.calls('POST /driver/job/complete')[0]?.body).toEqual({ cashReceived: true });
    expect(await screen.findByText(t.summaryHeading)).toBeOnTheScreen();
    expect(screen.getByText('Avenue Bourguiba')).toBeOnTheScreen();
    expect(screen.getByText('La Marsa')).toBeOnTheScreen();
    expect(await screen.findByText('65 TND')).toBeOnTheScreen();
    expect(await screen.findByText('DPN-2026-000007')).toBeOnTheScreen();
    expect(screen.getByText(t.time('2026-01-01T10:40:00.000Z'))).toBeOnTheScreen();
    expect(screen.getByText(t.time(STAGE_TIMES.towing.towingAt))).toBeOnTheScreen();
    expect(screen.queryByText(t.noJob)).toBeNull();

    await press('Back to requests');
    await flush();
    expect(view.getPathname()).toBe('/');
    expect(screen.queryByText('Current job')).toBeNull();
    expect(screen.getByText('Go online to see requests')).toBeOnTheScreen();
  });

  it('shows an error when completing fails', async () => {
    mockApi();
    confirmWith(1);
    server.failWith = 500;
    await renderApp();
    await flush();

    await press('Dropped off · cash received 65 TND');
    expect(await screen.findByText(t.completeFailed)).toBeOnTheScreen();
  });
});

describe('cancelling', () => {
  it('needs a reason before it asks to confirm', async () => {
    const api = mockApi();
    const alert = confirmWith(1);
    await renderApp();
    await flush();

    await press('Cancel job');
    expect(screen.getByText(t.cancelReasonRequired)).toBeOnTheScreen();
    expect(alert).not.toHaveBeenCalled();
    expect(api.calls(`POST /tow-requests/${REQUEST_ID}/cancel`)).toHaveLength(0);

    await pickReason('Customer unreachable');
    expect(screen.queryByText(t.cancelReasonRequired)).toBeNull();
    await press('Cancel job');
    await flush();
    expect(api.calls(`POST /tow-requests/${REQUEST_ID}/cancel`)[0]?.body).toEqual({
      reason: 'customer_unreachable',
    });
    expect(view.getPathname()).toBe('/');
  });

  it.each(['accepted', 'en_route', 'arrived'] as const)('is offered at %s', async (stage) => {
    server.job = { ...baseJob, tripStage: stage };
    mockApi();
    await renderApp();
    await flush();
    expect(await screen.findByRole('button', { name: 'Cancel job' })).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('is hidden once towing', async () => {
    server.job = { ...baseJob, tripStage: 'towing' };
    mockApi();
    await renderApp();
    await flush();
    expect(
      await screen.findByRole('button', { name: 'Dropped off · cash received 65 TND' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel job' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
