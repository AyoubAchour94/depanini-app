import type { Place } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { env } from '@/config/env';

import { PickupStep } from './PickupStep';
import { createTestQueryClient } from '@/test/queryClient';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: 'pk.test', apiUrl: undefined, environment: 'dev' },
}));

const location = jest.mocked(Location);

const address = 'Avenue Habib Bourguiba, Tunis, Tunisie';
const geocodeBody = {
  features: [{ geometry: { coordinates: [10, 36] }, properties: { full_address: address } }],
};

async function renderStep(onConfirm: (place: Place) => void = jest.fn()) {
  const queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <PickupStep onConfirm={onConfirm} />
    </QueryClientProvider>,
  );
  return onConfirm;
}

function grantLocation(latitude: number, longitude: number) {
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true } as never);
  location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude, longitude } } as never);
}

afterEach(() => {
  env.mapboxAccessToken = 'pk.test';
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('PickupStep', () => {
  it('asks for permission, shows the address at the current location and confirms it', async () => {
    grantLocation(36.85, 10.2);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(geocodeBody));
    const onConfirm = await renderStep();

    expect(await screen.findByText(address)).toBeOnTheScreen();
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Location access is off/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm pickup' }));
    expect(onConfirm).toHaveBeenCalledWith({ latitude: 36.85, longitude: 10.2, address });
  });

  it('starts in Tunis with a message when permission is denied', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false } as never);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(geocodeBody));
    const onConfirm = await renderStep();

    expect(await screen.findByText(/Location access is off/)).toBeOnTheScreen();
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(await screen.findByText(address)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm pickup' }));
    expect(onConfirm).toHaveBeenCalledWith({ latitude: 36.8065, longitude: 10.1815, address });
  });

  it('starts in Tunis when the position cannot be read', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true } as never);
    location.getCurrentPositionAsync.mockRejectedValue(new Error('Location unavailable'));
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(geocodeBody));
    await renderStep();

    expect(await screen.findByText(/Could not find your location/)).toBeOnTheScreen();
  });

  it('shows the coordinates, and still confirms, when reverse geocoding fails', async () => {
    grantLocation(36.85, 10.2);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 500 }));
    const onConfirm = await renderStep();

    expect(
      await screen.findByText(
        'Address unavailable, using the pin position.',
        {},
        { timeout: 4000 },
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('36.85000, 10.20000')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm pickup' }));
    expect(onConfirm).toHaveBeenCalledWith({
      latitude: 36.85,
      longitude: 10.2,
      address: '36.85000, 10.20000',
    });
  });

  it('shows the coordinates without calling Mapbox when no token is configured', async () => {
    env.mapboxAccessToken = undefined;
    grantLocation(36.85, 10.2);
    jest.spyOn(globalThis, 'fetch');
    await renderStep();

    expect(await screen.findByText('36.85000, 10.20000')).toBeOnTheScreen();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updates the address when the map stops moving', async () => {
    grantLocation(36.85, 10.2);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(geocodeBody));
    await renderStep();
    await screen.findByText(address);

    const moved = {
      features: [
        {
          geometry: { coordinates: [10, 36] },
          properties: { full_address: 'Rue de Marseille, Tunis' },
        },
      ],
    };
    (fetch as jest.Mock).mockResolvedValue(Response.json(moved));
    fireEvent(screen.getByTestId('mapbox-map'), 'mapIdle', {
      properties: { center: [10.3, 36.9] },
    });

    expect(await screen.findByText('Rue de Marseille, Tunis')).toBeOnTheScreen();
  });

  it('does not let the customer confirm a pin outside Tunisia', async () => {
    grantLocation(36.85, 10.2);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(geocodeBody));
    await renderStep();
    await screen.findByText(address);

    fireEvent(screen.getByTestId('mapbox-map'), 'mapIdle', {
      properties: { center: [2.35, 48.85] },
    });

    expect(await screen.findByText('Move the pin to a place in Tunisia.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm pickup' })).toBeDisabled();
  });
});
