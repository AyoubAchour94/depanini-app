import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { env } from '@/config/env';

import { MapScreen } from './MapScreen';

jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: undefined, environment: 'dev' },
}));

async function renderScreen() {
  const queryClient = new QueryClient({
    // No cache GC timer, so Jest can exit as soon as the tests finish.
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MapScreen />
    </QueryClientProvider>,
  );
}

describe('MapScreen', () => {
  afterEach(() => {
    env.mapboxAccessToken = undefined;
    env.apiUrl = undefined;
    jest.restoreAllMocks();
  });

  it('explains a missing Mapbox token instead of rendering a blank map', async () => {
    await renderScreen();

    expect(await screen.findByText('Mapbox token missing')).toBeOnTheScreen();
    expect(screen.queryByTestId('mapbox-map')).toBeNull();
  });

  it('renders the map when a token is configured', async () => {
    env.mapboxAccessToken = 'pk.test';
    await renderScreen();

    expect(await screen.findByTestId('mapbox-map')).toBeOnTheScreen();
  });

  it('says so when no API URL is configured', async () => {
    await renderScreen();

    expect(await screen.findByText('API: EXPO_PUBLIC_API_URL not set')).toBeOnTheScreen();
  });

  it('shows the API status reported by GET /health', async () => {
    env.apiUrl = 'http://api.test';
    const body = { status: 'degraded', timestamp: new Date().toISOString(), db: 'down' };
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status: 503 }));
    await renderScreen();

    expect(await screen.findByText('API: degraded (database down)')).toBeOnTheScreen();
    expect(fetch).toHaveBeenCalledWith(new URL('/health', 'http://api.test'), expect.anything());
  });

  it('reports the API as unreachable when the request fails', async () => {
    env.apiUrl = 'http://api.test';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
    await renderScreen();

    expect(await screen.findByText('API: unreachable')).toBeOnTheScreen();
  });

  it('shows the debug banner when Firebase is not configured', async () => {
    await renderScreen();

    expect(await screen.findByText('Firebase not configured')).toBeOnTheScreen();
  });
});
