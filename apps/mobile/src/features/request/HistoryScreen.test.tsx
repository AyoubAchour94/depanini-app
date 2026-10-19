import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { HistoryScreen } from './HistoryScreen';
import { createTestQueryClient } from '@/test/queryClient';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const place = (address: string) => ({ latitude: 36.8, longitude: 10.18, address });

function row(n: number, status = 'expired') {
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
    proposedFare: 50 + n,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
  };
}

function mockPages(pages: Record<string, unknown>) {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const cursor = new URL(input.toString()).searchParams.get('cursor') ?? 'first';
    return Response.json(pages[cursor]);
  });
}

async function renderHistory() {
  const queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <HistoryScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

describe('HistoryScreen', () => {
  it('lists requests with route, fare and status, and loads the next page', async () => {
    mockPages({
      first: { items: [row(1, 'open'), row(2, 'cancelled')], nextCursor: 'page-2' },
      'page-2': { items: [row(3)], nextCursor: null },
    });
    await renderHistory();

    expect(await screen.findByText('Pickup 1 → Dropoff 1')).toBeOnTheScreen();
    expect(screen.getByText('51 TND')).toBeOnTheScreen();
    expect(screen.getByText('Open')).toBeOnTheScreen();
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
    expect(screen.queryByText('Pickup 3 → Dropoff 3')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Pickup 3 → Dropoff 3')).toBeOnTheScreen();
    expect(screen.getByText('Expired')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    const urls = jest.mocked(fetch).mock.calls.map(([url]) => new URL(url.toString()));
    expect(urls[1]!.searchParams.get('cursor')).toBe('page-2');
  });

  it('skips a row the app cannot read and keeps the rest', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockPages({
      first: { items: [row(1), { ...row(2), status: 'finished' }, row(3)], nextCursor: null },
    });
    await renderHistory();

    expect(await screen.findByText('Pickup 1 → Dropoff 1')).toBeOnTheScreen();
    expect(screen.getByText('Pickup 3 → Dropoff 3')).toBeOnTheScreen();
    expect(screen.queryByText('Pickup 2 → Dropoff 2')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('labels an assigned request', async () => {
    mockPages({ first: { items: [row(1, 'assigned')], nextCursor: null } });
    await renderHistory();

    expect(await screen.findByText('Assigned')).toBeOnTheScreen();
  });

  it('shows the agreed fare of a completed request', async () => {
    mockPages({
      first: { items: [{ ...row(1, 'completed'), agreedFare: 77 }], nextCursor: null },
    });
    await renderHistory();

    expect(await screen.findByText('Completed')).toBeOnTheScreen();
    expect(screen.getByText('77 TND')).toBeOnTheScreen();
    expect(screen.queryByText('51 TND')).toBeNull();
  });

  it('shows the payment status on completed requests only', async () => {
    const paid = (n: number, status: string) => ({
      ...row(n, 'completed'),
      agreedFare: 77,
      payment: { status, amountTnd: 77, receiptNo: `DPN-2026-00000${n}` },
    });
    mockPages({
      first: {
        items: [
          paid(1, 'driver_confirmed'),
          paid(2, 'customer_confirmed'),
          paid(3, 'disputed'),
          row(4),
        ],
        nextCursor: null,
      },
    });
    await renderHistory();

    expect(await screen.findByText('Payment to confirm')).toBeOnTheScreen();
    expect(screen.getByText('Payment confirmed')).toBeOnTheScreen();
    expect(screen.getByText('Payment disputed')).toBeOnTheScreen();
    expect(screen.getAllByText(/^Payment /)).toHaveLength(3);
  });

  it('shows an empty state', async () => {
    mockPages({ first: { items: [], nextCursor: null } });
    await renderHistory();

    expect(await screen.findByText('You have not requested a tow yet.')).toBeOnTheScreen();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    mockPages({ first: { items: [row(1)], nextCursor: null } });
    jest.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await renderHistory();

    expect(await screen.findByText(/Could not load your requests/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Pickup 1 → Dropoff 1')).toBeOnTheScreen();
  });
});
