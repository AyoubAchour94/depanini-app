import type { Receipt, TruckType } from '@depanini/shared';

import { requestStrings } from '@/features/request/strings';

import { formatTnd } from './money';

const TRUCK_LABELS: Record<TruckType, string> = { flatbed: 'Flatbed', wheel_lift: 'Wheel-lift' };

/** The truck type as text, e.g. "Wheel-lift". */
export const truckLabel = (type: TruckType) => TRUCK_LABELS[type];

/** The vehicle and problem in one line, e.g. "Car · Battery". */
export const vehicleSummary = (receipt: Pick<Receipt, 'vehicleType' | 'problemType'>) =>
  `${requestStrings.vehicleOptions[receipt.vehicleType]} · ${requestStrings.problemOptions[receipt.problemType]}`;

/**
 * The receipt as plain text for sharing. Only what the receipt carries: it has
 * no phone number and no plate, so neither can end up in a shared message.
 */
export function formatReceiptText(receipt: Receipt): string {
  const completed = new Date(receipt.completedAt).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Tunis',
  });
  return [
    'Depanini receipt',
    `No: ${receipt.receiptNo}`,
    `Date: ${completed}`,
    `From: ${receipt.pickup.address}`,
    `To: ${receipt.dropoff.address}`,
    `Vehicle: ${vehicleSummary(receipt)}`,
    `Distance: ${(receipt.distanceM / 1000).toFixed(1)} km`,
    `Driver: ${receipt.driver.fullName} (${truckLabel(receipt.driver.truckType)})`,
    `Customer: ${receipt.customer.fullName}`,
    `Paid in cash: ${formatTnd(receipt.agreedFare)}`,
  ].join('\n');
}
