import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { registerForPush } from '@/push';

import { FareStep } from './FareStep';
import { RequestFlowProvider } from './RequestFlowContext';
import { createTestQueryClient } from '@/test/queryClient';

jest.mock('@/push', () => ({ registerForPush: jest.fn(async () => {}) }));
jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const pickup = { latitude: 36.8, longitude: 10.18, address: 'Tunis' };
const dropoff = { latitude: 36.88, longitude: 10.32, address: 'La Marsa' };
const estimate = { distanceM: 12_400, suggestedFare: 65, minFare: 52, maxFare: 195 };
const created = {
  id: '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10',
  status: 'open',
  pickup,
  dropoff,
  vehicleType: 'car',
  problemType: 'flat_tire',
  note: 'rear left',
  distanceM: 12_400,
  suggestedFare: 65,
  proposedFare: 65,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
};

/** Answers the estimate with `estimate` and the create call with `onCreate`. */
function mockApi(onCreate: () => Response = () => Response.json(created, { status: 201 })) {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const { pathname } = new URL(url.toString());
    return pathname === '/tow-requests/estimate' ? Response.json(estimate) : onCreate();
  });
}

/** The fare in the stepper (the suggested fare and the range ends show amounts too). */
const fareAmount = () => screen.getByTestId('fare-amount');

const createCalls = () =>
  jest
    .mocked(fetch)
    .mock.calls.filter(([url]) => new URL(url.toString()).pathname === '/tow-requests');

async function renderStep(handlers: Partial<Parameters<typeof FareStep>[0]> = {}) {
  const props = {
    onCreated: jest.fn(),
    onAlreadyOpen: jest.fn(),
    onNoProfile: jest.fn(),
    ...handlers,
  };
  const queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <RequestFlowProvider
        initial={{
          pickup,
          dropoff,
          vehicleType: 'car',
          problemType: 'flat_tire',
          note: ' rear left ',
        }}
      >
        <FareStep {...props} />
      </RequestFlowProvider>
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => jest.mocked(registerForPush).mockClear());
afterEach(() => jest.restoreAllMocks());

describe('FareStep', () => {
  it('shows the route, starts at the suggested fare and marks it on the range bar', async () => {
    mockApi();
    await renderStep();

    expect(await screen.findByTestId('fare-amount')).toHaveTextContent('65 TND');
    expect(screen.getByText('12.4 km · ~19 min')).toBeOnTheScreen();
    expect(screen.getByText('Tunis')).toBeOnTheScreen();
    expect(screen.getByText('La Marsa')).toBeOnTheScreen();
    expect(screen.getByText(/^Suggested/)).toBeOnTheScreen();
    expect(screen.getByText('52 TND')).toBeOnTheScreen();
    expect(screen.getByText('195 TND')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe(
      '65 TND, between 52 TND and 195 TND',
    );
    expect(screen.getByTestId('range-suggested')).toBeOnTheScreen();
    expect(screen.getByText('Car · Flat tire')).toBeOnTheScreen();
    expect(screen.getByText('Cash')).toBeOnTheScreen();
    expect(screen.getByText(/Drivers can accept this fare or counter/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send request · 65 TND' })).toBeOnTheScreen();
  });

  it('steps by 1 dinar, and by 5 on a long press', async () => {
    mockApi();
    await renderStep();
    await screen.findByTestId('fare-amount');

    await fireEvent.press(screen.getByRole('button', { name: 'Increase fare' }));
    await waitFor(() => expect(fareAmount()).toHaveTextContent('66 TND'));
    await fireEvent(screen.getByRole('button', { name: 'Increase fare' }), 'longPress');
    await waitFor(() => expect(fareAmount()).toHaveTextContent('71 TND'));
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease fare' }));
    await waitFor(() => expect(fareAmount()).toHaveTextContent('70 TND'));
  });

  it('clamps the fare to the allowed range', async () => {
    mockApi();
    await renderStep();
    await screen.findByTestId('fare-amount');

    for (let i = 0; i < 4; i++) {
      await fireEvent(screen.getByRole('button', { name: 'Decrease fare' }), 'longPress');
    }
    await waitFor(() => expect(fareAmount()).toHaveTextContent('52 TND'));
    expect(screen.getByRole('button', { name: 'Decrease fare' })).toBeDisabled();

    for (let i = 0; i < 40; i++) {
      await fireEvent(screen.getByRole('button', { name: 'Increase fare' }), 'longPress');
    }
    await waitFor(() => expect(fareAmount()).toHaveTextContent('195 TND'));
    expect(screen.getByRole('button', { name: 'Increase fare' })).toBeDisabled();
  });

  it('sends the request with the chosen fare', async () => {
    mockApi();
    const { onCreated } = await renderStep();
    await screen.findByTestId('fare-amount');

    await fireEvent.press(screen.getByRole('button', { name: 'Increase fare' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Send request/ }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const [url, init] = createCalls()[0]!;
    expect(new URL(url.toString()).pathname).toBe('/tow-requests');
    expect(JSON.parse(String(init?.body))).toEqual({
      pickup,
      dropoff,
      vehicleType: 'car',
      problemType: 'flat_tire',
      note: 'rear left',
      proposedFare: 66,
    });
  });

  it('asks for notifications once the request was created', async () => {
    mockApi();
    const { onCreated } = await renderStep();
    await screen.findByTestId('fare-amount');
    expect(registerForPush).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: /^Send request/ }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(registerForPush).toHaveBeenCalledTimes(1);
  });

  it('does not ask for notifications when the request is rejected', async () => {
    mockApi(() => new Response(null, { status: 409 }));
    const { onAlreadyOpen } = await renderStep();
    await screen.findByTestId('fare-amount');

    await fireEvent.press(screen.getByRole('button', { name: /^Send request/ }));

    await waitFor(() => expect(onAlreadyOpen).toHaveBeenCalled());
    expect(registerForPush).not.toHaveBeenCalled();
  });

  it('opens the existing request on 409', async () => {
    mockApi(() => new Response(null, { status: 409 }));
    const { onAlreadyOpen, onCreated } = await renderStep();
    await screen.findByTestId('fare-amount');

    await fireEvent.press(screen.getByRole('button', { name: /^Send request/ }));

    await waitFor(() => expect(onAlreadyOpen).toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('hands over to onboarding on 403', async () => {
    mockApi(() => new Response(null, { status: 403 }));
    const { onNoProfile } = await renderStep();
    await screen.findByTestId('fare-amount');

    await fireEvent.press(screen.getByRole('button', { name: /^Send request/ }));

    await waitFor(() => expect(onNoProfile).toHaveBeenCalled());
  });

  it('reloads the range and says so when the fare is rejected', async () => {
    mockApi(() => Response.json({ issues: [{ path: ['proposedFare'] }] }, { status: 400 }));
    await renderStep();
    await screen.findByTestId('fare-amount');
    const estimateCalls = () => jest.mocked(fetch).mock.calls.length - createCalls().length;
    expect(estimateCalls()).toBe(1);

    await fireEvent.press(screen.getByRole('button', { name: /^Send request/ }));

    expect(await screen.findByText(/no longer allowed/)).toBeOnTheScreen();
    await waitFor(() => expect(estimateCalls()).toBe(2));
  });

  it('shows a retry when the estimate fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    await renderStep();

    expect(await screen.findByText(/Could not calculate the fare/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
