import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Share } from 'react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { HistoryScreen } from './HistoryScreen';
import { TripDetailScreen } from './TripDetailScreen';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const ID = '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10';
const place = (address: string) => ({ latitude: 36.8, longitude: 10.18, address });
const trip = {
  id: ID,
  status: 'completed',
  pickup: place('Avenue Bourguiba'),
  dropoff: place('La Marsa'),
  vehicleType: 'car',
  problemType: 'battery',
  note: null,
  distanceM: 12_500,
  suggestedFare: 64,
  proposedFare: 60,
  agreedFare: 85,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T09:55:00.000Z',
  completedAt: '2026-01-01T10:40:00.000Z',
  payment: { status: 'customer_confirmed', amountTnd: 85, receiptNo: 'DPN-2026-000123' },
};
const receipt = {
  receiptNo: 'DPN-2026-000123',
  completedAt: '2026-01-01T10:40:00.000Z',
  pickup: trip.pickup,
  dropoff: trip.dropoff,
  distanceM: 12_500,
  vehicleType: 'car',
  problemType: 'battery',
  agreedFare: 85,
  method: 'cash',
  driver: { fullName: 'Sami Trabelsi', truckType: 'wheel_lift' },
  customer: { fullName: 'Ali Ben Salah' },
};

function mockApi(history: unknown[]) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = new URL(input.toString());
    if (pathname === `/tow-requests/${ID}/receipt`) return Response.json(receipt);
    if (pathname === '/tow-requests') return Response.json({ items: history, nextCursor: null });
    return new Response(null, { status: 404 });
  });
}

function renderApp(initialUrl: string) {
  const queryClient = createTestQueryClient();
  return renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <Slot />
        </QueryClientProvider>
      ),
      'request/history': HistoryScreen,
      'request/trip/[id]': TripDetailScreen,
    },
    { initialUrl },
  );
}

afterEach(() => jest.restoreAllMocks());

describe('trip detail from history', () => {
  it('opens a row, shows the trip and its receipt, and shares it', async () => {
    mockApi([trip]);
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const router = await renderApp('/request/history');

    await fireEvent.press(await screen.findByRole('button', { name: /Avenue Bourguiba/ }));

    expect(router.getPathname()).toBe(`/request/trip/${ID}`);
    expect(await screen.findByText('DPN-2026-000123')).toBeOnTheScreen();
    expect(screen.getByText('Confirmed by customer')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Share receipt' }));
    expect(share.mock.calls[0]![0].message).toContain('DPN-2026-000123');
  });

  it('falls back to the receipt when the trip is not in the history cache', async () => {
    mockApi([]);
    await renderApp(`/request/trip/${ID}`);

    expect(await screen.findByText('DPN-2026-000123')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Share receipt' })).toBeOnTheScreen();
    expect(screen.queryByText('Trip times')).toBeNull();
  });
});
