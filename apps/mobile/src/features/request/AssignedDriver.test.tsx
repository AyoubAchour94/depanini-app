import type { TowRequest } from '@depanini/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { createTestQueryClient } from '@/test/queryClient';

import { AssignedDriver } from './AssignedDriver';
import { CompletedSummary } from './CompletedSummary';

const request = (driver: TowRequest['driver'], status: TowRequest['status'] = 'assigned') =>
  ({
    id: '0b8e3f3e-6a52-4a39-9b1c-0d6f3c3f7f10',
    status,
    pickup: { latitude: 36.8, longitude: 10.18, address: 'Tunis centre' },
    dropoff: { latitude: 36.88, longitude: 10.32, address: 'La Marsa' },
    vehicleType: 'car',
    problemType: 'battery',
    note: null,
    distanceM: 12_400,
    suggestedFare: 65,
    proposedFare: 70,
    agreedFare: 75,
    expiresAt: '2026-01-01T10:15:00.000Z',
    createdAt: '2026-01-01T10:00:00.000Z',
    driver,
  }) as TowRequest;

const withContact = {
  fullName: 'Ali Ben Salah',
  phone: '+21620123456',
  truckType: 'wheel_lift',
  plateNumber: '123 TU 4567',
} as const;

describe('AssignedDriver', () => {
  it('has a Call button with the formatted phone, and the plate', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await render(<AssignedDriver request={request(withContact)} />);

    expect(screen.getByText(/123 TU 4567/)).toBeTruthy();
    // The number is not on screen; the button carries it formatted.
    expect(screen.queryByText(/216/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Call +216 20 123 456' }));
    expect(open).toHaveBeenCalledWith('tel:+21620123456');
    open.mockRestore();
  });

  it('has no phone row, call link or plate when they are null', async () => {
    await render(
      <AssignedDriver
        request={request({ ...withContact, phone: null, plateNumber: null }, 'completed')}
      />,
    );

    expect(screen.getByText('Ali Ben Salah')).toBeTruthy();
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText(/^Call/)).toBeNull();
    expect(screen.getByText('Wheel-lift')).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });
});

describe('CompletedSummary', () => {
  it('renders a completed request whose driver has no phone or plate', async () => {
    await render(
      <QueryClientProvider client={createTestQueryClient()}>
        <CompletedSummary
          request={request({ ...withContact, phone: null, plateNumber: null }, 'completed')}
          driverName="Ali Ben Salah"
          onDone={() => undefined}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Ali Ben Salah')).toBeTruthy();
    expect(screen.queryByText(/^Call/)).toBeNull();
    expect(screen.queryByText('Phone')).toBeNull();
  });
});
