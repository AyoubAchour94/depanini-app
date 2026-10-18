import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router as navigator, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Linking, Text } from 'react-native';

import { ActiveRequestScreen } from './ActiveRequestScreen';
import { RequestFlowProvider, useRequestFlow } from './RequestFlowContext';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const pickup = { latitude: 36.8, longitude: 10.18, address: 'Avenue Habib Bourguiba, Tunis' };
const dropoff = { latitude: 36.88, longitude: 10.32, address: 'La Marsa' };
const now = Date.parse('2026-01-01T10:05:00.000Z');
const open = {
  id: '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10',
  status: 'open',
  pickup,
  dropoff,
  vehicleType: 'suv_van',
  problemType: 'flat_tire',
  note: 'rear left',
  distanceM: 12_400,
  suggestedFare: 65,
  proposedFare: 70,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
};

const offer = (n: number, fare: number, name = `Driver ${n}`) => ({
  id: `7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6${n}`,
  requestId: open.id,
  fare,
  etaMin: 10 + n,
  distanceToPickupM: 8_000 + n * 100,
  status: 'pending',
  expiresAt: '2026-01-01T10:08:00.000Z',
  createdAt: '2026-01-01T10:01:00.000Z',
  driver: { fullName: name, truckType: 'flatbed' },
});
const assignedRequest = {
  ...open,
  status: 'assigned',
  agreedFare: 75,
  assignedAt: '2026-01-01T10:04:00.000Z',
  driver: {
    fullName: 'Ali Ben Salah',
    phone: '+21620123456',
    truckType: 'wheel_lift',
    plateNumber: '123 TU 4567',
  },
};

/** What `GET /tow-requests/active` answers; null is a 204. */
let active: unknown;
let cancelStatus: number;
let offers: unknown[];
let acceptStatus: number;

function mockApi() {
  active = open;
  cancelStatus = 200;
  offers = [];
  acceptStatus = 200;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const { pathname } = new URL(input.toString());
    if (pathname === `/tow-requests/${open.id}/offers`) return Response.json(offers);
    if (pathname.startsWith('/offers/') && init?.method === 'POST') {
      if (pathname.endsWith('/accept')) {
        if (acceptStatus !== 200) return new Response(null, { status: acceptStatus });
        active = assignedRequest;
        return Response.json(assignedRequest);
      }
      const declined = offers.shift() as ReturnType<typeof offer>;
      return Response.json({ ...declined, status: 'declined' });
    }
    if (pathname === '/tow-requests/active') {
      return active === null ? new Response(null, { status: 204 }) : Response.json(active);
    }
    if (pathname === `/tow-requests/${open.id}/cancel` && init?.method === 'POST') {
      if (cancelStatus !== 200) return new Response(null, { status: cancelStatus });
      active = null;
      return Response.json({ ...open, status: 'cancelled' });
    }
    return new Response(null, { status: 404 });
  });
}

/** Shows the draft so a test can see what "Request again" filled in. */
function DraftProbe() {
  const { pickup, dropoff, vehicleType, problemType, note, proposedFare } = useRequestFlow();
  return (
    <Text>{`${pickup?.address}|${dropoff?.address}|${vehicleType}|${problemType}|${note}|${proposedFare}`}</Text>
  );
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  return renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <RequestFlowProvider>
            <Slot />
          </RequestFlowProvider>
        </QueryClientProvider>
      ),
      index: () => null,
      'request/active': ActiveRequestScreen,
      'request/fare': DraftProbe,
    },
    { initialUrl: '/request/active?id=hint' },
  );
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(now);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ActiveRequestScreen', () => {
  it('shows the open request with the time left', async () => {
    mockApi();
    await renderScreen();

    expect(await screen.findByText('Waiting for drivers…')).toBeOnTheScreen();
    expect(screen.getByText('Expires in 10:00')).toBeOnTheScreen();
    expect(screen.getByText('Avenue Habib Bourguiba, Tunis')).toBeOnTheScreen();
    expect(screen.getByText('La Marsa')).toBeOnTheScreen();
    expect(screen.getByText('SUV / van · Flat tire')).toBeOnTheScreen();
    expect(screen.getByText('70 TND')).toBeOnTheScreen();

    await act(async () => jest.advanceTimersByTime(3000));
    expect(screen.getByText('Expires in 9:57')).toBeOnTheScreen();
  });

  it('cancels after a confirmation and goes back home', async () => {
    mockApi();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const router = await renderScreen();
    await screen.findByText('Waiting for drivers…');
    // Home is under the active screen, as after a create.
    await act(async () => navigator.replace('/'));
    await act(async () => navigator.push('/request/active'));
    await screen.findByText('Waiting for drivers…');

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel request' }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'POST' }),
    );

    await act(async () =>
      alert.mock.calls[0]![2]!.find((b) => b.text === 'Cancel request')!.onPress!(),
    );
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(jest.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('keeps the request when the confirmation is declined', async () => {
    mockApi();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    await screen.findByText('Waiting for drivers…');

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel request' }));
    await act(async () =>
      alert.mock.calls[0]![2]!.find((b) => b.text === 'Keep request')!.onPress!(),
    );

    expect(jest.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(screen.getByText('Waiting for drivers…')).toBeOnTheScreen();
  });

  it('shows the request as ended when the server no longer has it open, and refetches at zero', async () => {
    mockApi();
    await renderScreen();
    await screen.findByText('Waiting for drivers…');
    const activeCalls = () =>
      jest.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/active')).length;
    const before = activeCalls();

    // The server expires the request, the device clock reaches expiresAt.
    active = null;
    await act(async () => jest.advanceTimersByTime(10 * 60_000));

    expect(await screen.findByText('No driver took this request')).toBeOnTheScreen();
    expect(activeCalls()).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull();
  });

  it('request again fills the draft from the expired request without its fare', async () => {
    mockApi();
    const router = await renderScreen();
    await screen.findByText('Waiting for drivers…');
    active = null;
    await act(async () => jest.advanceTimersByTime(10 * 60_000));
    await screen.findByText('No driver took this request');

    await fireEvent.press(screen.getByRole('button', { name: 'Request again' }));

    expect(router.getPathname()).toBe('/request/fare');
    expect(
      await screen.findByText(
        'Avenue Habib Bourguiba, Tunis|La Marsa|suv_van|flat_tire|rear left|null',
      ),
    ).toBeOnTheScreen();
  });

  it('lists offers as returned, highlighting a fare above the proposed one', async () => {
    mockApi();
    offers = [offer(1, 65), offer(2, 70), offer(3, 80)];
    await renderScreen();

    expect(await screen.findByText('Driver 1')).toBeOnTheScreen();
    const names = screen.getAllByText(/^Driver \d$/).map((n) => n.props.children);
    expect(names).toEqual(['Driver 1', 'Driver 2', 'Driver 3']);
    expect(screen.getByText('Flatbed · 11 min away · 8.1 km')).toBeOnTheScreen();
    // Proposed fare is 70: only the 80 offer is above it.
    expect(screen.getAllByText('Above your fare')).toHaveLength(1);
    expect(screen.getByText('80 TND')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(3);
  });

  it('keeps waiting when there are no offers, and polls every 5 seconds', async () => {
    mockApi();
    await renderScreen();
    await screen.findByText('Waiting for drivers…');
    const offerCalls = () =>
      jest.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/offers')).length;
    const before = offerCalls();

    offers = [offer(1, 65)];
    await act(async () => jest.advanceTimersByTime(5000));

    expect(await screen.findByText('Driver 1')).toBeOnTheScreen();
    expect(offerCalls()).toBeGreaterThan(before);
  });

  it('accepts after confirming the fare, then shows the assigned driver', async () => {
    mockApi();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    offers = [offer(1, 75)];
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(alert).toHaveBeenCalledWith(
      'Accept this offer?',
      'Driver 1 will tow you for 75 TND.',
      expect.anything(),
      expect.anything(),
    );
    expect(jest.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    await act(async () => alert.mock.calls[0]![2]!.find((b) => b.text === 'Accept')!.onPress!());

    expect(await screen.findByText('Driver assigned')).toBeOnTheScreen();
    expect(screen.getByText('Ali Ben Salah')).toBeOnTheScreen();
    expect(screen.getByText('+21620123456')).toBeOnTheScreen();
    expect(screen.getByText('Wheel-lift · 123 TU 4567')).toBeOnTheScreen();
    expect(screen.getAllByText('75 TND').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Expires in/)).toBeNull();
    expect(screen.queryByText('Waiting for drivers…')).toBeNull();
  });

  it('does nothing when the accept confirmation is declined', async () => {
    mockApi();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    offers = [offer(1, 75)];
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    await act(async () => alert.mock.calls[0]![2]!.find((b) => b.text === 'Not now')!.onPress!());

    expect(jest.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('says the offer is gone on a 409 and refetches', async () => {
    mockApi();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    offers = [offer(1, 75)];
    acceptStatus = 409;
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    const offerCalls = () =>
      jest.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/offers')).length;
    const before = offerCalls();

    offers = [];
    await act(async () => alert.mock.calls[0]![2]!.find((b) => b.text === 'Accept')!.onPress!());

    expect(await screen.findByText('This offer is no longer available.')).toBeOnTheScreen();
    await waitFor(() => expect(offerCalls()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText('Driver 1')).toBeNull());
  });

  it('declines an offer without confirming', async () => {
    mockApi();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    offers = [offer(1, 65), offer(2, 70)];
    await renderScreen();
    await screen.findByText('Driver 1');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Decline' })[0]!);

    await waitFor(() => expect(screen.queryByText('Driver 1')).toBeNull());
    expect(screen.getByText('Driver 2')).toBeOnTheScreen();
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows the assigned driver, hides the countdown and still cancels', async () => {
    mockApi();
    active = assignedRequest;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    const router = await renderScreen();
    await screen.findByText('Driver assigned');
    await act(async () => navigator.replace('/'));
    await act(async () => navigator.push('/request/active'));
    await screen.findByText('Driver assigned');
    expect(jest.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/offers'))).toBe(
      false,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Call +21620123456' }));
    expect(openUrl).toHaveBeenCalledWith('tel:+21620123456');

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel request' }));
    await act(async () =>
      alert.mock.calls[0]![2]!.find((b) => b.text === 'Cancel request')!.onPress!(),
    );
    await waitFor(() => expect(router.getPathname()).toBe('/'));
  });

  it('shows an empty state instead of an error when there is no request', async () => {
    mockApi();
    active = null;
    await renderScreen();

    expect(await screen.findByText('You have no open request')).toBeOnTheScreen();
    expect(screen.queryByText(/Could not load/)).toBeNull();
  });

  it('offers a retry when the request cannot be loaded', async () => {
    mockApi();
    jest.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await renderScreen();

    expect(await screen.findByText(/Could not load your request/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Waiting for drivers…')).toBeOnTheScreen();
  });
});
