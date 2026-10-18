import type { Place } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { env } from '@/config/env';

import { DropoffStep } from './DropoffStep';
import { createTestQueryClient } from '@/test/queryClient';

jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: 'pk.test', apiUrl: undefined, environment: 'dev' },
}));

const SEARCH_DEBOUNCE_MS = 300;
const pickup: Place = { latitude: 36.8, longitude: 10.18, address: 'Tunis' };
const marsa = 'La Marsa, Tunis, Tunisie';

function feature(name: string, coordinates: [number, number]) {
  return { geometry: { coordinates }, properties: { full_address: name } };
}

async function renderStep(onConfirm: (place: Place) => void = jest.fn()) {
  const queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <DropoffStep pickup={pickup} onConfirm={onConfirm} />
    </QueryClientProvider>,
  );
  return onConfirm;
}

// The search is debounced; fake timers let the tests step past it instead of waiting in real time.
beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  jest.useRealTimers();
  env.mapboxAccessToken = 'pk.test';
  jest.restoreAllMocks();
});

describe('DropoffStep', () => {
  it('searches and confirms the chosen result', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ features: [feature(marsa, [10.32, 36.88])] }));
    const onConfirm = await renderStep();

    await fireEvent.changeText(screen.getByLabelText('Where should it go?'), 'marsa');
    await act(() => jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    await fireEvent.press(await screen.findByRole('button', { name: marsa }));

    expect(onConfirm).toHaveBeenCalledWith({ latitude: 36.88, longitude: 10.32, address: marsa });
  });

  it('leaves out results outside Tunisia', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [feature('Paris', [2.35, 48.85]), feature(marsa, [10.32, 36.88])],
      }),
    );
    await renderStep();

    await fireEvent.changeText(screen.getByLabelText('Where should it go?'), 'par');
    await act(() => jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(await screen.findByRole('button', { name: marsa })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Paris' })).toBeNull();
  });

  it('says so when nothing matches', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ features: [] }));
    await renderStep();

    await fireEvent.changeText(screen.getByLabelText('Where should it go?'), 'zzzz');
    await act(() => jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(await screen.findByText('No places found.')).toBeOnTheScreen();
  });

  it('picks the spot under the pin on the map', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({ features: [feature(marsa, [10.32, 36.88])] }),
      );
    const onConfirm = await renderStep();

    await fireEvent.press(screen.getByRole('button', { name: 'Pick on map' }));
    await fireEvent(await screen.findByTestId('mapbox-map'), 'mapIdle', {
      properties: { center: [10.32, 36.88] },
    });
    expect(await screen.findByText(marsa)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Confirm drop-off' }));
    expect(onConfirm).toHaveBeenCalledWith({ latitude: 36.88, longitude: 10.32, address: marsa });
  });

  it('does not accept a pin outside Tunisia', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ features: [] }));
    await renderStep();

    await fireEvent.press(screen.getByRole('button', { name: 'Pick on map' }));
    await fireEvent(await screen.findByTestId('mapbox-map'), 'mapIdle', {
      properties: { center: [2.35, 48.85] },
    });

    expect(await screen.findByText('Move the pin to a place in Tunisia.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm drop-off' })).toBeDisabled();
  });
});
