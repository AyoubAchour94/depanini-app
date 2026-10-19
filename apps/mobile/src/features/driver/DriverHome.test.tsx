import { QueryClientProvider } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { DriverHome } from './DriverHome';
import { RequestDetailsScreen } from './RequestDetailsScreen';
import { registerForPush } from '@/push';
import { createTestQueryClient } from '@/test/queryClient';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('@/push', () => ({ registerForPush: jest.fn(async () => {}) }));
jest.mock('@/firebase/firebase', () => ({
  getFirebaseStatus: () => ({ configured: true }),
  getCurrentIdToken: async () => 'id-token',
}));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: 'pk.test', apiUrl: 'http://api.test', environment: 'dev' },
}));

const location = jest.mocked(Location);

const request = {
  id: '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f',
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Avenue Bourguiba' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  vehicleType: 'car',
  problemType: 'battery',
  note: 'Keys inside',
  distanceM: 12_000,
  proposedFare: 60,
  suggestedFare: 64,
  minFare: 52,
  maxFare: 192,
  expiresAt: '2026-01-01T10:15:00.000Z',
  distanceToPickupM: 4_000,
};

const job = {
  ...request,
  status: 'assigned',
  agreedFare: 60,
  assignedAt: '2026-01-01T10:01:00.000Z',
  createdAt: '2026-01-01T09:55:00.000Z',
  customer: { fullName: 'Sami Trabelsi', phone: '+21620123456' },
};

let nearbyBody: unknown[] = [];
let jobBody: unknown | null = null;
// When set, `online: true` presence requests wait for it.
let holdOnline: Promise<void> | null = null;

/** Fakes the API and records the calls as `METHOD path`. */
function mockApi() {
  const calls: { call: string; body?: unknown }[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const call = `${init?.method ?? 'GET'} ${path}`;
    calls.push({ call, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/driver/presence') {
      if (holdOnline && JSON.parse(String(init?.body)).online) await holdOnline;
      return Response.json({ online: JSON.parse(String(init?.body)).online });
    }
    if (path === '/driver/job') {
      return jobBody ? Response.json(jobBody) : new Response(null, { status: 204 });
    }
    if (path === '/driver/offers/active') return Response.json([]);
    return Response.json(nearbyBody);
  });
  return {
    calls: (name: string) => calls.filter((c) => c.call === name),
  };
}

function renderHome(initialUrl = '/') {
  const queryClient = createTestQueryClient();
  return renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      ),
      index: DriverHome,
      account: () => null,
      'job-offer/[id]': () => <RequestDetailsScreen id={request.id} />,
    },
    { initialUrl },
  );
}

/** Lets pending promises (permission, position, fetch) settle under fake timers. */
const flush = () => act(async () => jest.advanceTimersByTime(0));

async function goOnline() {
  await act(async () => fireEvent(screen.getByRole('switch'), 'valueChange', true));
  await flush();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  nearbyBody = [];
  jobBody = null;
  holdOnline = null;
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true } as never);
  location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 36.81, longitude: 10.17 },
  } as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

/** Moves the clock a second at a time until the job card is (or is not) on the screen. */
async function untilShown(text: string, shown = true) {
  for (let i = 0; i < 30 && !!screen.queryByText(text) !== shown; i++) {
    await act(async () => jest.advanceTimersByTime(1_000));
    await flush();
  }
}

describe('DriverHome presence interval', () => {
  it('sends every 5 seconds while a job exists', async () => {
    jobBody = job;
    const api = mockApi();
    await renderHome();
    await flush();
    await goOnline();
    expect(api.calls('PUT /driver/presence')).toHaveLength(1);

    await act(async () => jest.advanceTimersByTime(5_000));
    await flush();
    expect(api.calls('PUT /driver/presence')).toHaveLength(2);
    await act(async () => jest.advanceTimersByTime(5_000));
    await flush();
    expect(api.calls('PUT /driver/presence')).toHaveLength(3);
  });

  it('speeds up when a job appears and slows down when it ends, without leaking timers', async () => {
    const api = mockApi();
    await renderHome();
    await flush();
    await goOnline();
    await act(async () => jest.advanceTimersByTime(15_000));
    await flush();
    expect(api.calls('PUT /driver/presence')).toHaveLength(2);
    const timersAtFifteen = jest.getTimerCount();

    // The next job poll finds the job: a send right away, then every 5 s.
    jobBody = job;
    await untilShown('Current job');
    await flush();
    const afterStart = api.calls('PUT /driver/presence').length;
    expect(afterStart).toBeGreaterThan(2);
    await act(async () => jest.advanceTimersByTime(5_000));
    await flush();
    expect(api.calls('PUT /driver/presence')).toHaveLength(afterStart + 1);

    // The job ends at the next poll: back to every 15 s.
    jobBody = null;
    await untilShown('Current job', false);
    await flush();
    const afterEnd = api.calls('PUT /driver/presence').length;
    await act(async () => jest.advanceTimersByTime(14_000));
    await flush();
    // The switch back sent at once; nothing more until a full 15 s have passed.
    expect(api.calls('PUT /driver/presence')).toHaveLength(afterEnd);
    await act(async () => jest.advanceTimersByTime(1_000));
    await flush();
    expect(api.calls('PUT /driver/presence')).toHaveLength(afterEnd + 1);
    // Each switch replaced the interval instead of adding one.
    expect(jest.getTimerCount()).toBeLessThanOrEqual(timersAtFifteen);
  });
});

describe('DriverHome presence', () => {
  it('starts offline without calling the API', async () => {
    const api = mockApi();
    await renderHome();
    await flush();

    expect(await screen.findByText('Go online to see requests')).toBeOnTheScreen();
    expect(screen.getByRole('switch').props.value).toBe(false);
    expect(api.calls('PUT /driver/presence')).toHaveLength(0);
    expect(api.calls('GET /driver/requests/nearby')).toHaveLength(0);
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('tells the driver a request was cancelled after tapping that push, until dismissed', async () => {
    mockApi();
    await renderHome('/?notice=request-cancelled');
    await flush();

    expect(await screen.findByText('The customer cancelled that request.')).toBeOnTheScreen();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Dismiss' })));
    expect(screen.queryByText('The customer cancelled that request.')).not.toBeOnTheScreen();
  });

  it('shows no notice by default', async () => {
    mockApi();
    await renderHome();
    await flush();

    expect(screen.queryByText('The customer cancelled that request.')).not.toBeOnTheScreen();
  });

  it('asks for notifications when going online, not before and not when denied', async () => {
    mockApi();
    await renderHome();
    await flush();
    expect(registerForPush).not.toHaveBeenCalled();

    location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    await goOnline();
    expect(registerForPush).not.toHaveBeenCalled();

    await goOnline();
    expect(registerForPush).toHaveBeenCalledTimes(1);
  });

  it('stays offline with a message when permission is denied', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false } as never);
    const api = mockApi();
    await renderHome();
    await goOnline();

    expect(screen.getByText(/Location access is needed/)).toBeOnTheScreen();
    expect(screen.getByText('Go online to see requests')).toBeOnTheScreen();
    expect(api.calls('PUT /driver/presence')).toHaveLength(0);
  });

  it('sends the location at once and every 15 seconds, then stops when switched off', async () => {
    const api = mockApi();
    await renderHome();
    await flush();
    const timersWhileOffline = jest.getTimerCount();
    await goOnline();

    const sent = api.calls('PUT /driver/presence');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({
      online: true,
      location: { latitude: 36.81, longitude: 10.17 },
    });

    await act(async () => jest.advanceTimersByTime(15_000));
    expect(api.calls('PUT /driver/presence')).toHaveLength(2);
    await act(async () => jest.advanceTimersByTime(15_000));
    expect(api.calls('PUT /driver/presence')).toHaveLength(3);

    await act(async () => fireEvent(screen.getByRole('switch'), 'valueChange', false));
    await flush();
    const afterOff = api.calls('PUT /driver/presence');
    expect(afterOff).toHaveLength(4);
    expect(afterOff[3]?.body).toEqual({ online: false });

    await act(async () => jest.advanceTimersByTime(60_000));
    expect(api.calls('PUT /driver/presence')).toHaveLength(4);
    // The presence interval is gone, not just idle.
    expect(jest.getTimerCount()).toBe(timersWhileOffline);
    expect(location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('stops sending on blur, resumes on focus and leaves no timer on unmount', async () => {
    const api = mockApi();
    const view = await renderHome();
    await goOnline();
    expect(api.calls('PUT /driver/presence')).toHaveLength(1);

    await act(async () => router.push('/account'));
    await flush();
    await act(async () => jest.advanceTimersByTime(45_000));
    expect(api.calls('PUT /driver/presence')).toHaveLength(1);

    await act(async () => router.back());
    await flush();
    expect(api.calls('PUT /driver/presence')).toHaveLength(2);

    await view.unmount();
    await act(async () => jest.advanceTimersByTime(45_000));
    expect(api.calls('PUT /driver/presence')).toHaveLength(2);
  });
});

describe('DriverHome presence ordering', () => {
  it('does not start another send while one is pending', async () => {
    location.getCurrentPositionAsync.mockImplementation(() => new Promise(() => {}));
    const api = mockApi();
    await renderHome();
    await goOnline();
    await act(async () => jest.advanceTimersByTime(60_000));

    expect(location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(api.calls('PUT /driver/presence')).toHaveLength(0);
  });

  it('sends online false last when switched off during a send', async () => {
    let release: () => void = () => {};
    holdOnline = new Promise<void>((resolve) => (release = resolve));
    const api = mockApi();
    await renderHome();
    await goOnline();
    expect(api.calls('PUT /driver/presence')).toHaveLength(1);

    await act(async () => fireEvent(screen.getByRole('switch'), 'valueChange', false));
    await flush();
    expect(api.calls('PUT /driver/presence')).toHaveLength(1);

    await act(async () => release());
    await flush();
    const puts = api.calls('PUT /driver/presence');
    expect(puts).toHaveLength(2);
    expect(puts[1]?.body).toEqual({ online: false });
  });

  it('ignores a second switch-on while the permission prompt is open', async () => {
    let answer: (value: unknown) => void = () => {};
    location.requestForegroundPermissionsAsync.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)) as never,
    );
    const api = mockApi();
    await renderHome();
    await goOnline();
    await goOnline();
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);

    await act(async () => answer({ granted: true }));
    await flush();
    expect(screen.getByRole('switch').props.value).toBe(true);
    expect(api.calls('PUT /driver/presence')).toHaveLength(1);
  });

  it('stays offline when switched off while the permission prompt is open', async () => {
    let answer: (value: unknown) => void = () => {};
    location.requestForegroundPermissionsAsync.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)) as never,
    );
    const api = mockApi();
    await renderHome();
    await goOnline();
    await act(async () => fireEvent(screen.getByRole('switch'), 'valueChange', false));
    await flush();
    await act(async () => answer({ granted: true }));
    await flush();

    expect(screen.getByRole('switch').props.value).toBe(false);
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(
      api.calls('PUT /driver/presence').every((c) => !(c.body as { online: boolean }).online),
    ).toBe(true);
  });
});

describe('RequestDetailsScreen', () => {
  it('says the request is gone, with a way back, when it is not in the list', async () => {
    mockApi();
    await renderHome();
    await act(async () => router.push({ pathname: '/job-offer/[id]', params: { id: request.id } }));
    expect(await screen.findByText('This request is no longer available.')).toBeOnTheScreen();

    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Back to requests' })),
    );
    expect(await screen.findByText('Go online to see requests')).toBeOnTheScreen();
  });
});

describe('DriverHome nearby list', () => {
  it('polls every 10 seconds only while online and focused', async () => {
    const api = mockApi();
    await renderHome();
    await flush();
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(api.calls('GET /driver/requests/nearby')).toHaveLength(0);

    await goOnline();
    expect(api.calls('GET /driver/requests/nearby')).toHaveLength(1);
    await act(async () => jest.advanceTimersByTime(10_000));
    expect(api.calls('GET /driver/requests/nearby')).toHaveLength(2);

    await act(async () => router.push('/account'));
    await flush();
    await act(async () => jest.advanceTimersByTime(40_000));
    expect(api.calls('GET /driver/requests/nearby')).toHaveLength(2);
  });

  it('shows the empty state', async () => {
    mockApi();
    await renderHome();
    await goOnline();
    expect(await screen.findByText('No requests nearby right now')).toBeOnTheScreen();
  });

  it("shows the customer's rating on the row", async () => {
    nearbyBody = [{ ...request, myOffer: null, customer: { rating: { average: 4.2, count: 9 } } }];
    mockApi();
    await renderHome();
    await goOnline();

    expect(await screen.findByText('★ 4.2 (9)')).toBeOnTheScreen();
  });

  it('shows "New" for a customer with few ratings', async () => {
    nearbyBody = [{ ...request, myOffer: null, customer: { rating: { average: null, count: 1 } } }];
    mockApi();
    await renderHome();
    await goOnline();

    expect(await screen.findByText('New')).toBeOnTheScreen();
  });

  it('shows a row per request and opens its details', async () => {
    nearbyBody = [{ ...request, myOffer: null }];
    mockApi();
    await renderHome();
    await goOnline();

    expect(await screen.findByText('4.0 km away')).toBeOnTheScreen();
    expect(screen.getByText('Avenue Bourguiba → La Marsa')).toBeOnTheScreen();
    expect(screen.getByText('Car · Battery')).toBeOnTheScreen();
    expect(await screen.findByText('60 TND')).toBeOnTheScreen();
    expect(screen.getByText('15:00 left')).toBeOnTheScreen();

    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: /Avenue Bourguiba/ })),
    );
    await flush();
    expect(await screen.findByText('Keys inside')).toBeOnTheScreen();
    expect(screen.getByText('La Marsa')).toBeOnTheScreen();
    expect(await screen.findByText('Allowed range: 52 to 192 TND')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept for 60 TND' })).toBeOnTheScreen();
    expect(screen.getByTestId('mapbox-map')).toBeOnTheScreen();
  });
});
