import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { Text } from 'react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { EarningsScreen } from './EarningsScreen';
import { JobDetailScreen } from './JobDetailScreen';
import { MyJobsScreen } from './MyJobsScreen';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const place = (address: string) => ({ latitude: 36.8, longitude: 10.18, address });

function job(n: number, status = 'completed', extra: object = {}) {
  return {
    id: `0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f${String(n).padStart(2, '0')}`,
    status,
    pickup: place(`Pickup ${n}`),
    dropoff: place(`Dropoff ${n}`),
    vehicleType: 'car',
    problemType: 'battery',
    note: null,
    distanceM: 5000,
    suggestedFare: 50,
    proposedFare: 50,
    agreedFare: 60 + n,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
    completedAt: '2026-01-01T10:40:00.000Z',
    payment: { status: 'driver_confirmed', amountTnd: 60 + n, receiptNo: 'DPN-2026-000001' },
    ...extra,
  };
}

const receipt = (id: string) => ({
  receiptNo: 'DPN-2026-000009',
  completedAt: '2026-01-01T10:40:00.000Z',
  pickup: place('Pickup 9'),
  dropoff: place('Dropoff 9'),
  distanceM: 5000,
  vehicleType: 'car',
  problemType: 'battery',
  agreedFare: 69,
  method: 'cash',
  driver: { fullName: 'Sami Trabelsi', truckType: 'flatbed' },
  customer: { fullName: id ? 'Ali Ben Salah' : '' },
});

let earnings = {
  today: { trips: 1, totalTnd: 70 },
  week: { trips: 4, totalTnd: 300 },
  month: { trips: 12, totalTnd: 950 },
};
let pages: Record<string, unknown> = {};

function mockApi() {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input.toString());
    if (url.pathname === '/driver/jobs') {
      return Response.json(pages[url.searchParams.get('cursor') ?? 'first']);
    }
    if (url.pathname === '/driver/earnings') return Response.json(earnings);
    if (url.pathname.endsWith('/receipt')) return Response.json(receipt(url.pathname));
    return new Response('{}', { status: 404 });
  });
}

async function renderApp(initialUrl: string) {
  const queryClient = createTestQueryClient();
  return renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      ),
      index: () => <Text>Home</Text>,
      'jobs/index': MyJobsScreen,
      'jobs/[id]': JobDetailScreen,
      earnings: EarningsScreen,
    },
    { initialUrl },
  );
}

afterEach(() => jest.restoreAllMocks());

describe('my jobs', () => {
  it('lists finished jobs with route, fare, status and payment, and loads the next page', async () => {
    pages = {
      first: {
        items: [job(1), job(2, 'cancelled', { payment: null })],
        nextCursor: 'page-2',
      },
      'page-2': { items: [job(3)], nextCursor: null },
    };
    mockApi();
    await renderApp('/jobs');

    expect(await screen.findByText('Pickup 1 → Dropoff 1')).toBeOnTheScreen();
    expect(await screen.findByText('61 TND')).toBeOnTheScreen();
    expect(screen.getByText('Completed')).toBeOnTheScreen();
    expect(screen.getByText('Cash received')).toBeOnTheScreen();
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
    expect(await screen.findByText('50 TND')).toBeOnTheScreen();
    expect(screen.queryByText('Pickup 3 → Dropoff 3')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Pickup 3 → Dropoff 3')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    const urls = jest.mocked(fetch).mock.calls.map(([url]) => new URL(url.toString()));
    expect(urls[1]!.searchParams.get('cursor')).toBe('page-2');
  });

  it('skips a row the app cannot read and keeps the rest', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    pages = {
      first: { items: [job(1), { ...job(2), status: 'finished' }, job(3)], nextCursor: null },
    };
    mockApi();
    await renderApp('/jobs');

    expect(await screen.findByText('Pickup 1 → Dropoff 1')).toBeOnTheScreen();
    expect(screen.getByText('Pickup 3 → Dropoff 3')).toBeOnTheScreen();
    expect(screen.queryByText('Pickup 2 → Dropoff 2')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state', async () => {
    pages = { first: { items: [], nextCursor: null } };
    mockApi();
    await renderApp('/jobs');

    expect(await screen.findByText('No finished jobs yet.')).toBeOnTheScreen();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    pages = { first: { items: [job(1)], nextCursor: null } };
    mockApi();
    jest.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await renderApp('/jobs');

    expect(await screen.findByText(/Could not load your jobs/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Pickup 1 → Dropoff 1')).toBeOnTheScreen();
  });

  it('opens the trip detail with the receipt from a row', async () => {
    pages = { first: { items: [job(1)], nextCursor: null } };
    mockApi();
    const view = await renderApp('/jobs');

    await fireEvent.press(await screen.findByRole('button', { name: /View job: Pickup 1/ }));

    expect(view.getPathname()).toBe(`/jobs/${job(1).id}`);
    expect(await screen.findByText('DPN-2026-000009')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Share receipt' })).toBeOnTheScreen();
  });
});

describe('job detail', () => {
  it('falls back to the receipt when the jobs list is not cached', async () => {
    mockApi();
    await renderApp(`/jobs/${job(9).id}`);

    expect(await screen.findByText('DPN-2026-000009')).toBeOnTheScreen();
    expect(screen.getByText('Sami Trabelsi (Flatbed)')).toBeOnTheScreen();
  });
});

describe('earnings', () => {
  it('shows trips and TND for today, this week and this month', async () => {
    mockApi();
    await renderApp('/earnings');

    expect(await screen.findByText('70 TND')).toBeOnTheScreen();
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('1 trip')).toBeOnTheScreen();
    expect(screen.getByText('This week')).toBeOnTheScreen();
    expect(await screen.findByText('300 TND')).toBeOnTheScreen();
    expect(screen.getByText('4 trips')).toBeOnTheScreen();
    expect(screen.getByText('This month')).toBeOnTheScreen();
    expect(await screen.findByText('950 TND')).toBeOnTheScreen();
    expect(screen.getByText('12 trips')).toBeOnTheScreen();
  });

  it('refreshes when the screen is focused again', async () => {
    mockApi();
    await renderApp('/earnings');
    expect(await screen.findByText('70 TND')).toBeOnTheScreen();

    await act(async () => router.push('/'));
    earnings = { ...earnings, today: { trips: 2, totalTnd: 155 } };
    await act(async () => router.back());

    expect(await screen.findByText('155 TND')).toBeOnTheScreen();
  });

  it('offers a retry when the earnings cannot be loaded', async () => {
    mockApi();
    jest.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await renderApp('/earnings');

    expect(await screen.findByText(/Could not load your earnings/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('300 TND')).toBeOnTheScreen();
  });
});
