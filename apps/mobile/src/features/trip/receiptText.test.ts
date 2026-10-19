import type { Receipt } from '@depanini/shared';

import { formatTnd } from './money';
import { formatReceiptText } from './receiptText';

const receipt: Receipt = {
  receiptNo: 'DPN-2026-000123',
  completedAt: '2026-01-01T10:40:00.000Z',
  pickup: { latitude: 36.8, longitude: 10.18, address: 'Avenue Bourguiba' },
  dropoff: { latitude: 36.85, longitude: 10.3, address: 'La Marsa' },
  distanceM: 12_500,
  vehicleType: 'car',
  problemType: 'battery',
  agreedFare: 85,
  method: 'cash',
  driver: { fullName: 'Sami Trabelsi', truckType: 'wheel_lift' },
  customer: { fullName: 'Ali Ben Salah' },
};

describe('formatTnd', () => {
  it('writes whole dinars', () => expect(formatTnd(85)).toBe('85 TND'));
});

describe('formatReceiptText', () => {
  it('lists the receipt number, route, parties and the cash fare', () => {
    expect(formatReceiptText(receipt)).toBe(
      [
        'Depanini receipt',
        'No: DPN-2026-000123',
        'Date: 1 Jan 2026, 11:40',
        'From: Avenue Bourguiba',
        'To: La Marsa',
        'Vehicle: Car · Battery',
        'Distance: 12.5 km',
        'Driver: Sami Trabelsi (Wheel-lift)',
        'Customer: Ali Ben Salah',
        'Paid in cash: 85 TND',
      ].join('\n'),
    );
  });

  it('never includes a phone number or a plate, even if the data carries them', () => {
    const leaky = {
      ...receipt,
      driver: { ...receipt.driver, phone: '+21622333444', plateNumber: '123 TU 4567' },
      customer: { ...receipt.customer, phone: '+21698123456' },
    } as Receipt;
    expect(formatReceiptText(leaky)).not.toMatch(/\+216|21622333444|123 TU 4567|plate|phone/i);
  });
});
