import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Alert, Linking } from 'react-native';

import { DriverHome } from './DriverHome';
import { JobScreen } from './JobScreen';
import { RequestDetailsScreen } from './RequestDetailsScreen';
import { createTestQueryClient } from '@/test/queryClient';

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
const OFFER_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const request = {
  id: REQUEST_ID,
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Avenue Bourguiba' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  vehicleType: 'car',
  problemType: 'battery',
  note: 'Keys inside',
  distanceM: 12_000,
  proposedFare: 60,
  suggestedFare: 64,
  minFare: 58,
  maxFare: 70,
  expiresAt: '2026-01-01T10:15:00.000Z',
  distanceToPickupM: 4_000,
  myOffer: null,
};

const offer = {
  id: OFFER_ID,
  requestId: REQUEST_ID,
  fare: 65,
  etaMin: 12,
  distanceToPickupM: 4_000,
  status: 'pending',
  expiresAt: '2026-01-01T10:03:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
};

const job = {
  ...request,
  status: 'assigned',
  agreedFare: 65,
  assignedAt: '2026-01-01T10:01:00.000Z',
  createdAt: '2026-01-01T09:55:00.000Z',
  customer: { fullName: 'Sami Trabelsi', phone: '+21620123456' },
};

interface Server {
  nearby: unknown[];
  offers: unknown[];
  job: unknown | null;
  /** Status to answer the next POST with (default 200). */
  postStatus: number;
}
let server: Server;
let view: Awaited<ReturnType<typeof renderRouter>>;

/** Fakes the API and records the calls as `METHOD path`. */
function mockApi() {
  const calls: { call: string; body?: unknown }[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? 'GET';
    calls.push({
      call: `${method} ${path}`,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (method === 'POST') {
      if (server.postStatus !== 200) return new Response('{}', { status: server.postStatus });
      return Response.json(path.endsWith('/cancel') ? { ...job, status: 'cancelled' } : offer);
    }
    if (path === '/driver/requests/nearby') return Response.json(server.nearby);
    if (path === '/driver/offers/active') return Response.json(server.offers);
    if (path === '/driver/job') {
      return server.job ? Response.json(server.job) : new Response(null, { status: 204 });
    }
    return new Response('{}', { status: 404 });
  });
  return { calls: (name: string) => calls.filter((c) => c.call === name) };
}

async function renderApp(initialUrl = '/') {
  const queryClient = createTestQueryClient();
  // The nearby list is only read from the cache, so seed it like the home would.
  queryClient.setQueryData(['driver', 'requests', 'nearby'], server.nearby);
  view = await renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      ),
      index: DriverHome,
      job: JobScreen,
      'job-offer/[id]': () => <RequestDetailsScreen id={REQUEST_ID} />,
    },
    { initialUrl },
  );
  return queryClient;
}

const flush = () => act(async () => jest.advanceTimersByTime(0));
const pickReason = async (name: string) =>
  act(async () => fireEvent.press(screen.getByRole('radio', { name })));
const press = async (name: string | RegExp) => {
  await act(async () => fireEvent.press(screen.getByRole('button', { name })));
  await flush();
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  server = { nearby: [request], offers: [], job: null, postStatus: 200 };
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('request details', () => {
  it("shows the customer's rating", async () => {
    server.nearby = [{ ...request, customer: { rating: { average: 4.9, count: 40 } } }];
    mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    expect(await screen.findByText('★ 4.9 (40)')).toBeOnTheScreen();
  });
});

describe('sending an offer', () => {
  it('accepts at the customer fare and refreshes offers and job', async () => {
    const api = mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();
    const jobBefore = api.calls('GET /driver/job').length;

    await press('Accept 60 TND');

    const sent = api.calls(`POST /tow-requests/${REQUEST_ID}/offers`);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({ fare: 60 });
    expect(api.calls('GET /driver/job').length).toBeGreaterThan(jobBefore);
    expect(api.calls('GET /driver/offers/active').length).toBeGreaterThan(1);
  });

  it('sends a counter-offer, stepping by 1 and 5 and clamping to the range', async () => {
    const api = mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    await press('Increase fare');
    expect(await screen.findByText('61 TND')).toBeOnTheScreen();
    await act(async () =>
      fireEvent(screen.getByRole('button', { name: 'Increase fare' }), 'longPress'),
    );
    await act(async () =>
      fireEvent(screen.getByRole('button', { name: 'Increase fare' }), 'longPress'),
    );
    expect(await screen.findByText('70 TND')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Increase fare' }).props.accessibilityState).toEqual({
      disabled: true,
    });

    await press('Offer 70');
    expect(api.calls(`POST /tow-requests/${REQUEST_ID}/offers`)[0]?.body).toEqual({ fare: 70 });
  });

  it('offers chips a few dinars above the fare, within the range, and sends the picked one', async () => {
    const api = mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    // Offer does the same as Accept until the fare changes, so it stays disabled.
    expect(screen.getByRole('button', { name: 'Offer 60' })).toBeDisabled();

    // 60 + 5, 10, 15 is 65, 70, 75; the range ends at 70.
    expect(screen.getByRole('radio', { name: 'Counter-offer 65 TND' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Counter-offer 70 TND' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Counter-offer 75 TND' })).toBeNull();

    await act(async () =>
      fireEvent.press(screen.getByRole('radio', { name: 'Counter-offer 65 TND' })),
    );
    expect(
      screen.getByRole('radio', { name: 'Counter-offer 65 TND' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(await screen.findByText('65 TND')).toBeOnTheScreen();

    expect(screen.getByRole('button', { name: 'Offer 65' })).toBeEnabled();
    await press('Offer 65');
    expect(api.calls(`POST /tow-requests/${REQUEST_ID}/offers`)[0]?.body).toEqual({ fare: 65 });
  });

  it('says the request is gone on 409', async () => {
    server.postStatus = 409;
    mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();
    await press('Accept 60 TND');
    expect(await screen.findByText('This request is no longer available.')).toBeOnTheScreen();
  });

  it('says the fare is not allowed on 400', async () => {
    server.postStatus = 400;
    mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();
    // Offer is only enabled once the fare differs from the customer's.
    await act(async () =>
      fireEvent.press(screen.getByRole('radio', { name: 'Counter-offer 65 TND' })),
    );
    await press('Offer 65');
    expect(await screen.findByText(/fare is not allowed/)).toBeOnTheScreen();
  });
});

describe('a sent offer', () => {
  beforeEach(() => {
    server.offers = [offer];
    server.nearby = [{ ...request, myOffer: offer }];
  });

  it('shows its status with a countdown, polls every 5 seconds and withdraws', async () => {
    const api = mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    expect(screen.getByText('Offer sent')).toBeOnTheScreen();
    expect(await screen.findByText('Your offer: 65 TND')).toBeOnTheScreen();
    expect(screen.getByText('Expires in 3:00')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Accept / })).toBeNull();

    const polls = api.calls('GET /driver/offers/active').length;
    await act(async () => jest.advanceTimersByTime(5_000));
    expect(api.calls('GET /driver/offers/active').length).toBe(polls + 1);

    server.offers = [{ ...offer, status: 'withdrawn' }];
    await press('Withdraw offer');
    expect(api.calls(`POST /offers/${OFFER_ID}/withdraw`)).toHaveLength(1);
    expect(await screen.findByText('You withdrew your offer')).toBeOnTheScreen();
    // The request is still open, so the driver can offer again.
    expect(screen.getByRole('button', { name: 'Accept 60 TND' })).toBeOnTheScreen();
  });

  it('goes to the job screen when the offer is accepted', async () => {
    mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    server.offers = [{ ...offer, status: 'accepted' }];
    server.job = job;
    await act(async () => jest.advanceTimersByTime(5_000));
    await flush();

    expect(await screen.findByText('Sami Trabelsi')).toBeOnTheScreen();
    expect(view.getPathname()).toBe('/job');
  });

  it('goes to the job screen when another offer withdraws this one because we got a job', async () => {
    mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    server.offers = [{ ...offer, status: 'withdrawn' }];
    server.job = job;
    await act(async () => jest.advanceTimersByTime(10_000));
    await flush();

    expect(view.getPathname()).toBe('/job');
  });

  it('tells the driver the customer chose another driver', async () => {
    mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    server.nearby = [];
    server.offers = [{ ...offer, status: 'rejected' }];
    await act(async () => jest.advanceTimersByTime(5_000));
    await flush();

    expect(await screen.findByText('The customer chose another driver')).toBeOnTheScreen();
  });

  it('tells the driver the offer expired when the countdown ends', async () => {
    mockApi();
    await renderApp('/job-offer/' + REQUEST_ID);
    await flush();

    server.offers = [{ ...offer, status: 'expired' }];
    await act(async () => jest.advanceTimersByTime(180_000));
    await flush();

    expect(await screen.findByText('Your offer expired')).toBeOnTheScreen();
  });
});

describe('the job', () => {
  beforeEach(() => {
    server.job = job;
  });

  it('shows a job card on the home instead of the nearby list', async () => {
    const api = mockApi();
    await renderApp();
    await flush();

    expect(await screen.findByText('Current job')).toBeOnTheScreen();
    expect(screen.getByText('Sami Trabelsi')).toBeOnTheScreen();
    expect(await screen.findByText('65 TND')).toBeOnTheScreen();
    expect(api.calls('GET /driver/requests/nearby')).toHaveLength(0);

    await press('View job');
    expect(view.getPathname()).toBe('/job');
  });

  it('shows the customer, the trip and the fare, and calls the customer', async () => {
    mockApi();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderApp('/job');
    await flush();

    expect(await screen.findByText('Sami Trabelsi')).toBeOnTheScreen();
    expect(screen.getByText('Avenue Bourguiba')).toBeOnTheScreen();
    expect(screen.getByText('La Marsa')).toBeOnTheScreen();
    expect(screen.getByText('Car · Battery')).toBeOnTheScreen();
    expect(screen.getByText('Keys inside')).toBeOnTheScreen();
    expect(await screen.findByText('65 TND')).toBeOnTheScreen();

    await press(/Call/);
    expect(open).toHaveBeenCalledWith('tel:+21620123456');
  });

  it('keeps the job when the confirmation is declined', async () => {
    const api = mockApi();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.[0]?.onPress?.();
    });
    await renderApp('/job');
    await flush();

    await pickReason('Unsafe situation');
    await press('Cancel job');
    expect(api.calls(`POST /tow-requests/${REQUEST_ID}/cancel`)).toHaveLength(0);
  });

  it('cancels the job after confirming, then goes home', async () => {
    const api = mockApi();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.[1]?.onPress?.();
    });
    await renderApp('/job');
    await flush();

    server.job = null;
    await pickReason('Unsafe situation');
    await press('Cancel job');
    await flush();

    expect(api.calls(`POST /tow-requests/${REQUEST_ID}/cancel`)).toHaveLength(1);
    expect(api.calls(`POST /tow-requests/${REQUEST_ID}/cancel`)[0]?.body).toEqual({
      reason: 'unsafe',
    });
    expect(view.getPathname()).toBe('/');
    expect(screen.queryByText('Current job')).toBeNull();
  });

  it('shows an error when the cancel fails', async () => {
    mockApi();
    server.postStatus = 409;
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.[1]?.onPress?.();
    });
    await renderApp('/job');
    await flush();

    await pickReason('Unsafe situation');
    await press('Cancel job');
    expect(await screen.findByText('Could not cancel the job. Try again.')).toBeOnTheScreen();
  });
});
