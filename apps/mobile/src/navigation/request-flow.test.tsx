import { router as navigator } from 'expo-router';
import { Alert } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { AuthUser } from '@/auth/firebase-auth';
import RootLayout from '@/app/_layout';
import ActiveRequest from '@/app/request/active';
import Details from '@/app/request/details';
import Dropoff from '@/app/request/dropoff';
import Fare from '@/app/request/fare';
import Pickup from '@/app/request/pickup';
import { CustomerHome } from '@/features/request/CustomerHome';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => {}),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 36.8, longitude: 10.18 },
  })),
  Accuracy: { Balanced: 3 },
}));

jest.mock('@/firebase/firebase', () => ({
  getFirebaseStatus: () => ({ configured: true }),
  getCurrentIdToken: async () => 'id-token',
}));

let mockEmitUser: (user: AuthUser | null) => void = () => {};
jest.mock('@/auth/firebase-auth', () => ({
  subscribeToAuth: jest.fn((listener: (user: AuthUser | null) => void) => {
    mockEmitUser = listener;
    return () => {};
  }),
}));

jest.mock('@/variant/variant', () => ({
  get variant() {
    return jest.requireActual('@/variant/variants').VARIANTS.user;
  },
}));

jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: 'pk.test', apiUrl: 'http://api.test', environment: 'dev' },
}));

const requestId = '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10';
const me = {
  id: '7b0f1a52-3c43-4c1e-9d0e-2f6b1d8f5a10',
  email: 'ali@example.com',
  customerProfile: { fullName: 'Ali Ben Salah', phone: '+21698123456' },
  driverProfile: null,
};
const pickupAddress = 'Avenue Habib Bourguiba, Tunis';
const marsa = 'La Marsa, Tunis, Tunisie';
const estimate = { distanceM: 12_400, suggestedFare: 65, minFare: 52, maxFare: 195 };

type CreateAnswer = () => Response;

/** Fakes the API and Mapbox: reverse geocoding answers the pickup address, search the drop-off. */
function mockApi(create: CreateAnswer = () => Response.json(created(), { status: 201 })) {
  // The customer has an open request once a create was accepted (201) or refused as a duplicate (409).
  let hasOpen = false;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input.toString());
    if (url.pathname === '/me') return Response.json(me);
    if (url.pathname === '/tow-requests/estimate') return Response.json(estimate);
    if (url.pathname === '/tow-requests/active') {
      return hasOpen ? Response.json(created()) : new Response(null, { status: 204 });
    }
    if (url.pathname === '/tow-requests') {
      const response = create();
      hasOpen = response.status === 201 || response.status === 409;
      return response;
    }
    const reverse = url.pathname.endsWith('/reverse');
    const feature = reverse
      ? { geometry: { coordinates: [10.18, 36.8] }, properties: { full_address: pickupAddress } }
      : { geometry: { coordinates: [10.32, 36.88] }, properties: { full_address: marsa } };
    return Response.json({ features: [feature] });
  });
}

function created() {
  const pickup = { latitude: 36.8, longitude: 10.18, address: pickupAddress };
  const dropoff = { latitude: 36.88, longitude: 10.32, address: marsa };
  return {
    id: requestId,
    status: 'open',
    pickup,
    dropoff,
    vehicleType: 'suv_van',
    problemType: 'flat_tire',
    note: 'rear left',
    distanceM: 12_400,
    suggestedFare: 65,
    proposedFare: 66,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    createdAt: '2026-01-01T10:00:00.000Z',
  };
}

function renderApp() {
  return renderRouter({
    _layout: RootLayout,
    index: CustomerHome,
    'request/pickup': Pickup,
    'request/dropoff': Dropoff,
    'request/details': Details,
    'request/fare': Fare,
    'request/active': ActiveRequest,
    'request/history': () => null,
    account: () => null,
    profile: () => null,
    'delete-account': () => null,
    onboarding: () => null,
    'loading-account': () => null,
    'sign-in': () => null,
    'sign-up': () => null,
    'forgot-password': () => null,
  });
}

const press = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));

/** Signs in and walks to the fare step. */
async function goToFare(router: Awaited<ReturnType<typeof renderApp>>) {
  await act(async () => mockEmitUser({ uid: 'u1', email: me.email }));
  await press('Request a tow');
  expect(await screen.findByText(pickupAddress)).toBeOnTheScreen();
  await press('Confirm pickup');

  await fireEvent.changeText(await screen.findByLabelText('Where should it go?'), 'marsa');
  await fireEvent.press(await screen.findByRole('button', { name: 'La Marsa, Tunis' }));

  await fireEvent.press(await screen.findByRole('radio', { name: 'SUV / van' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Flat tire' }));
  await fireEvent.changeText(screen.getByLabelText('Note for the driver (optional)'), 'rear left');
  await press('Next');

  expect(await screen.findByTestId('fare-amount')).toBeOnTheScreen();
  expect(router.getPathname()).toBe('/request/fare');
}

afterEach(() => jest.restoreAllMocks());

describe('request flow', () => {
  it('walks from pickup to a sent request', async () => {
    mockApi();
    const router = await renderApp();
    await goToFare(router);

    await fireEvent.press(screen.getByRole('button', { name: 'Increase fare' }));
    await press(/^Send request/);

    expect(await screen.findByText('Waiting for drivers…')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/request/active');

    const [, init] = jest
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) => new URL(url.toString()).pathname === '/tow-requests' && init?.method,
      )!;
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer id-token' });
    expect(JSON.parse(String(init?.body))).toEqual({
      pickup: { latitude: 36.8, longitude: 10.18, address: pickupAddress },
      dropoff: { latitude: 36.88, longitude: 10.32, address: marsa },
      vehicleType: 'suv_van',
      problemType: 'flat_tire',
      note: 'rear left',
      proposedFare: 66,
    });
  });

  it('leaves the finished flow behind: back from the sent request does not return to the fare', async () => {
    mockApi();
    const router = await renderApp();
    await goToFare(router);
    await press(/^Send request/);
    await screen.findByText('Waiting for drivers…');

    expect(navigator.canGoBack()).toBe(true);
    await act(async () => navigator.back());
    expect(router.getPathname()).toBe('/');
  });

  it('keeps what was entered when going back', async () => {
    mockApi();
    const router = await renderApp();
    await goToFare(router);

    await act(async () => navigator.back());
    expect(await screen.findByRole('radio', { name: 'SUV / van' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Note for the driver (optional)').props.value).toBe('rear left');
    expect(screen.getByRole('radio', { name: 'SUV / van' })).toBeChecked();
  });

  it('opens the existing request on 409', async () => {
    mockApi(() => new Response(null, { status: 409 }));
    const router = await renderApp();
    await goToFare(router);

    await press(/^Send request/);

    expect(await screen.findByText('Waiting for drivers…')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/request/active');
  });

  it('sends the customer to onboarding on 403', async () => {
    mockApi(() => new Response(null, { status: 403 }));
    const router = await renderApp();
    await goToFare(router);
    // The account is refetched after the 403, now without a customer profile.
    jest.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(input.toString());
      return url.pathname === '/me'
        ? Response.json({ ...me, customerProfile: null })
        : new Response(null, { status: 403 });
    });

    await press(/^Send request/);

    await waitFor(() => expect(router.getPathname()).toBe('/onboarding'));
  });

  it('asks before discarding the request when leaving the first step', async () => {
    mockApi();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const router = await renderApp();
    await act(async () => mockEmitUser({ uid: 'u1', email: me.email }));
    await press('Request a tow');
    await screen.findByText(pickupAddress);
    await press('Confirm pickup');
    await screen.findByLabelText('Where should it go?');
    await act(async () => navigator.back());
    expect(router.getPathname()).toBe('/request/pickup');

    // Leaving the flow: the first answer keeps editing, the second discards.
    await act(async () => navigator.back());
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => buttons.find((b) => b.text === 'Keep editing')!.onPress!());
    expect(router.getPathname()).toBe('/request/pickup');

    await act(async () => navigator.back());
    expect(alert).toHaveBeenCalledTimes(2);
    await act(async () => alert.mock.calls[1]![2]!.find((b) => b.text === 'Discard')!.onPress!());
    await waitFor(() => expect(router.getPathname()).toBe('/'));
  });
});
