import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Slot } from 'expo-router';

import { CustomerHome } from './CustomerHome';
import { RequestFlowProvider } from './RequestFlowContext';

jest.mock('@/firebase/firebase', () => ({
  getFirebaseStatus: () => ({ configured: true }),
  getCurrentIdToken: async () => 'id-token',
}));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: 'pk.test', apiUrl: 'http://api.test', environment: 'dev' },
}));

const place = (address: string) => ({ latitude: 36.8, longitude: 10.18, address });
const open = {
  id: '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10',
  status: 'open',
  pickup: place('Tunis centre'),
  dropoff: place('La Marsa'),
  vehicleType: 'car',
  problemType: 'battery',
  note: null,
  distanceM: 5000,
  suggestedFare: 50,
  proposedFare: 55,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
};

function mockActive(body: unknown) {
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      body === null ? new Response(null, { status: 204 }) : Response.json(body),
    );
}

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  return renderRouter({
    _layout: () => (
      <QueryClientProvider client={queryClient}>
        <RequestFlowProvider>
          <Slot />
        </RequestFlowProvider>
      </QueryClientProvider>
    ),
    index: CustomerHome,
    'request/pickup': () => null,
    'request/active': () => null,
  });
}

afterEach(() => jest.restoreAllMocks());

describe('CustomerHome', () => {
  it('offers a new request when there is no open one', async () => {
    mockActive(null);
    const router = await renderHome();

    await fireEvent.press(await screen.findByRole('button', { name: 'Request a tow' }));

    expect(router.getPathname()).toBe('/request/pickup');
    expect(screen.queryByText('Your tow request is open')).toBeNull();
  });

  it('shows the open request instead, and opens it', async () => {
    mockActive(open);
    const router = await renderHome();

    expect(await screen.findByText('Your tow request is open')).toBeOnTheScreen();
    expect(screen.getByText('Tunis centre → La Marsa')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Request a tow' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'View your request' }));

    expect(router.getPathname()).toBe('/request/active');
  });
});
