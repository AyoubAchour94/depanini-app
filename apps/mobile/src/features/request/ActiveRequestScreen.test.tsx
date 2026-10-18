import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router as navigator, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Text } from 'react-native';

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

/** What `GET /tow-requests/active` answers; null is a 204. */
let active: unknown;
let cancelStatus: number;

function mockApi() {
  active = open;
  cancelStatus = 200;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const { pathname } = new URL(input.toString());
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
