import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { env } from '@/config/env';

import type { ComponentProps } from 'react';

import { MapScreen } from './MapScreen';
import { createTestQueryClient } from '@/test/queryClient';

jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: undefined, environment: 'dev' },
}));

async function renderScreen(props: ComponentProps<typeof MapScreen> = {}) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MapScreen {...props} />
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

  it('shows no developer status on screen', async () => {
    await renderScreen();

    expect(await screen.findByText('Mapbox token missing')).toBeOnTheScreen();
    expect(screen.queryByText(/^API:/)).toBeNull();
    expect(screen.queryByText('Firebase not configured')).toBeNull();
  });

  it('draws the center pin by default and not when it has markers', async () => {
    env.mapboxAccessToken = 'pk.test';
    const { rerender } = await renderScreen();
    expect(await screen.findByTestId('center-pin')).toBeOnTheScreen();

    const pickup = {
      id: 'pickup',
      kind: 'pickup' as const,
      coordinate: { latitude: 36.8, longitude: 10.18 },
    };
    await rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <MapScreen markers={[pickup]} />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('center-pin')).toBeNull();
  });

  it('puts the floating controls, the pill and the sheet over the map', async () => {
    env.mapboxAccessToken = 'pk.test';
    await renderScreen({
      topStart: <Text>Back</Text>,
      pill: <Text>18.4 km</Text>,
      topEnd: <Text>Menu</Text>,
      sheet: { children: <Text>Where to?</Text>, footer: <Text>Request a tow</Text> },
    });

    expect(await screen.findByText('Back')).toBeOnTheScreen();
    expect(screen.getByText('18.4 km')).toBeOnTheScreen();
    expect(screen.getByText('Menu')).toBeOnTheScreen();
    expect(screen.getByText('Where to?')).toBeOnTheScreen();
    expect(screen.getByText('Request a tow')).toBeOnTheScreen();
  });

  it('still draws children over the map', async () => {
    await renderScreen({ children: <Text>Over the map</Text> });

    expect(await screen.findByText('Over the map')).toBeOnTheScreen();
  });
});
