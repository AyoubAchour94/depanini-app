import type { TowRequest } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, Share } from 'react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { shareText } from './share';
import { TripDetail } from './TripDetail';

jest.mock('@/firebase/firebase', () => ({ getCurrentIdToken: async () => 'id-token' }));
jest.mock('@/config/env', () => ({
  env: { mapboxAccessToken: undefined, apiUrl: 'http://api.test', environment: 'dev' },
}));

const ID = '7b0c8f2e-5d1a-4c3b-9e6f-2a1b3c4d5e6f';

const request = {
  id: ID,
  status: 'completed',
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Avenue Bourguiba' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  vehicleType: 'car',
  problemType: 'battery',
  note: null,
  distanceM: 12_500,
  suggestedFare: 64,
  proposedFare: 60,
  agreedFare: 85,
  expiresAt: '2026-01-01T10:15:00.000Z',
  createdAt: '2026-01-01T09:55:00.000Z',
  assignedAt: '2026-01-01T10:01:00.000Z',
  enRouteAt: '2026-01-01T10:05:00.000Z',
  completedAt: '2026-01-01T10:40:00.000Z',
  payment: { status: 'driver_confirmed', amountTnd: 85, receiptNo: 'DPN-2026-000123' },
} as TowRequest;

const receipt = {
  receiptNo: 'DPN-2026-000123',
  completedAt: '2026-01-01T10:40:00.000Z',
  pickup: request.pickup,
  dropoff: request.dropoff,
  distanceM: 12_500,
  vehicleType: 'car',
  problemType: 'battery',
  agreedFare: 85,
  method: 'cash',
  driver: { fullName: 'Sami Trabelsi', truckType: 'wheel_lift' },
  customer: { fullName: 'Ali Ben Salah' },
};

function mockReceipt(status = 200) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      status === 200 ? Response.json(receipt) : new Response('{}', { status }),
    );
}

async function renderDetail(value: TowRequest = request) {
  await render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TripDetail request={value} side="customer" />
    </QueryClientProvider>,
  );
}

const nativeOS = Platform.OS;
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = nativeOS;
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('TripDetail', () => {
  it('shows the route, fare, stage times and the receipt of a completed trip', async () => {
    const fetchMock = mockReceipt();
    await renderDetail();

    expect(await screen.findByText('Avenue Bourguiba')).toBeOnTheScreen();
    expect(screen.getByText('La Marsa')).toBeOnTheScreen();
    expect(screen.getByText('Cash received')).toBeOnTheScreen();
    expect(await screen.findByText('DPN-2026-000123')).toBeOnTheScreen();
    // The fare shows in the trip block and again as "Paid in cash" in the receipt,
    // so wait for the receipt to settle before counting the matches.
    expect(screen.getAllByText('85 TND')).toHaveLength(2);
    expect(screen.getByText('Sami Trabelsi (Wheel-lift)')).toBeOnTheScreen();
    expect(screen.getByText('Ali Ben Salah')).toBeOnTheScreen();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      `http://api.test/tow-requests/${ID}/receipt`,
    );
  });

  it('has no receipt for a cancelled trip', async () => {
    const fetchMock = mockReceipt();
    await renderDetail({ ...request, status: 'cancelled', payment: null } as TowRequest);

    expect(await screen.findByText('Cancelled')).toBeOnTheScreen();
    expect(await screen.findByText('60 TND')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Share receipt' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the receipt is not available, and retries when it fails otherwise', async () => {
    mockReceipt(404);
    await renderDetail();
    expect(await screen.findByText('This receipt is not available.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers a retry when the receipt cannot be loaded', async () => {
    mockReceipt(500);
    await renderDetail();
    expect(await screen.findByText('Could not load the receipt.')).toBeOnTheScreen();

    mockReceipt();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('DPN-2026-000123')).toBeOnTheScreen();
  });

  describe('sharing', () => {
    it('opens the share sheet with the receipt text on native', async () => {
      mockReceipt();
      const share = jest
        .spyOn(Share, 'share')
        .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
      await renderDetail();

      await fireEvent.press(await screen.findByRole('button', { name: 'Share receipt' }));

      const [{ message }] = share.mock.calls[0]!;
      expect(message).toContain('DPN-2026-000123');
      expect(message).toContain('Paid in cash: 85 TND');
      expect(message).not.toMatch(/phone|plate|\+216/i);
    });

    it('says when sharing fails', async () => {
      mockReceipt();
      jest.spyOn(Share, 'share').mockRejectedValue(new Error('no'));
      await renderDetail();

      await fireEvent.press(await screen.findByRole('button', { name: 'Share receipt' }));

      expect(await screen.findByText('Could not share the receipt.')).toBeOnTheScreen();
    });

    it('copies to the clipboard on the web without navigator.share, and says so', async () => {
      mockReceipt();
      Platform.OS = 'web';
      const writeText = jest.fn(async () => {});
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await renderDetail();

      await fireEvent.press(await screen.findByRole('button', { name: 'Share receipt' }));

      expect(await screen.findByText('Copied')).toBeOnTheScreen();
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('DPN-2026-000123'));
    });
  });
});

describe('shareText on the web', () => {
  beforeEach(() => {
    Platform.OS = 'web';
  });

  it('uses navigator.share when the browser has it', async () => {
    const share = jest.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    await expect(shareText('hello')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('treats a closed share sheet as cancelled', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    Object.defineProperty(navigator, 'share', {
      value: jest.fn(async () => Promise.reject(abort)),
      configurable: true,
    });

    await expect(shareText('hello')).resolves.toBe('cancelled');
  });

  it('rejects when there is no clipboard either', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    await expect(shareText('hello')).rejects.toThrow();
  });
});
