import { QueryClientProvider } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import { env } from '@/config/env';
import { createTestQueryClient } from '@/test/queryClient';

import { DriverHome } from './DriverHome';
import { TestLocationScreen } from './TestLocationScreen';
import { getTestLocation, resetTestLocationForTests, setTestLocation } from './testLocation';

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
  env: {
    mapboxAccessToken: 'pk.test',
    apiUrl: 'http://api.test',
    environment: 'dev',
    enableTestLocation: true,
  },
}));

const location = jest.mocked(Location);
const address = 'Sfax, Tunisie';

function mockApi() {
  const presence: unknown[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const { pathname, hostname } = new URL(String(url));
    if (hostname.includes('mapbox')) {
      return Response.json({
        features: [{ geometry: { coordinates: [10, 34] }, properties: { full_address: address } }],
      });
    }
    if (pathname === '/driver/presence') {
      presence.push(JSON.parse(String(init?.body)));
      return Response.json({ online: true });
    }
    if (pathname === '/driver/job') return new Response(null, { status: 204 });
    return Response.json([]);
  });
  return presence;
}

function renderHome() {
  const queryClient = createTestQueryClient();
  return renderRouter({
    _layout: () => (
      <QueryClientProvider client={queryClient}>
        <Stack />
      </QueryClientProvider>
    ),
    index: DriverHome,
    'test-location': TestLocationScreen,
  });
}

const flush = () => act(async () => jest.advanceTimersByTime(0));

beforeEach(() => {
  jest.useFakeTimers();
  resetTestLocationForTests();
  env.enableTestLocation = true;
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true } as never);
  location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 52.37, longitude: 4.9 },
  } as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

async function setOnMap() {
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Set on map' })));
  await flush();
  // The map settles on Sfax.
  await act(async () =>
    fireEvent(screen.getByTestId('mapbox-map'), 'mapIdle', {
      properties: { center: [10.76, 34.74] },
    }),
  );
  await flush();
  expect(await screen.findByText(address)).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Use this location' })));
  await flush();
}

describe('test location', () => {
  it('is hidden when the flag is off', async () => {
    env.enableTestLocation = false;
    mockApi();
    await renderHome();
    await flush();
    expect(screen.queryByText('Set on map')).toBeNull();
    expect(screen.queryByText(/Using:/)).toBeNull();
  });

  it('shows the GPS by default and the chosen place after setting it on the map', async () => {
    mockApi();
    await renderHome();
    await flush();
    expect(screen.getByText('Using: device GPS')).toBeOnTheScreen();
    expect(screen.queryByText('Use device GPS')).toBeNull();

    await setOnMap();
    expect(screen.getByText(`Using: ${address} (test)`)).toBeOnTheScreen();
    expect(getTestLocation()).toEqual({ latitude: 34.74, longitude: 10.76, address });
  });

  it('does not accept a place outside Tunisia', async () => {
    mockApi();
    await renderHome();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Set on map' })));
    await flush();
    await act(async () =>
      fireEvent(screen.getByTestId('mapbox-map'), 'mapIdle', {
        properties: { center: [4.9, 52.37] },
      }),
    );
    await flush();
    expect(screen.getByText('Move the pin to a place in Tunisia.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use this location' })).toBeDisabled();
  });

  it('sends the test coordinate without asking for location permission', async () => {
    const presence = mockApi();
    await renderHome();
    await flush();
    await setOnMap();

    await act(async () => fireEvent(screen.getByRole('switch'), 'valueChange', true));
    await flush();

    expect(presence).toEqual([{ online: true, location: { latitude: 34.74, longitude: 10.76 } }]);
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('goes back to the device GPS', async () => {
    const presence = mockApi();
    await renderHome();
    await flush();
    await setOnMap();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Use device GPS' })));
    expect(screen.getByText('Using: device GPS')).toBeOnTheScreen();

    await act(async () => fireEvent(screen.getByRole('switch'), 'valueChange', true));
    await flush();
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    // The Amsterdam fix is outside Tunisia, so nothing is sent.
    expect(presence).toEqual([]);
  });

  it('keeps the setting across a remount', async () => {
    mockApi();
    const first = await renderHome();
    await flush();
    await setOnMap();
    await first.unmount();

    await renderHome();
    await flush();
    expect(screen.getByText(`Using: ${address} (test)`)).toBeOnTheScreen();
  });
});

describe('test location storage on web', () => {
  const originalOs = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOs;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('is saved in localStorage and read back after a reload', () => {
    Platform.OS = 'web';
    const data = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
    resetTestLocationForTests();
    setTestLocation({ latitude: 34.74, longitude: 10.76, address });

    resetTestLocationForTests();
    expect(getTestLocation()).toEqual({ latitude: 34.74, longitude: 10.76, address });

    setTestLocation(null);
    resetTestLocationForTests();
    expect(getTestLocation()).toBeNull();
  });

  it('survives storage that throws', () => {
    Platform.OS = 'web';
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    resetTestLocationForTests();
    expect(getTestLocation()).toBeNull();
    setTestLocation({ latitude: 34.74, longitude: 10.76, address });
    expect(getTestLocation()?.address).toBe(address);
  });
});
