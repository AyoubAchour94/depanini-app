import type { Receipt } from '@depanini/shared';

import { requestStrings } from '@/features/request/strings';
import { truckTypeLabel } from '@/features/profile/truck-types';
import { currentLanguage, translate } from '@/i18n';
import { formatDateTime, formatKilometres, formatMoney } from '@/i18n/format';

/** The truck type as text, e.g. "Wheel-lift". */
export const truckLabel = truckTypeLabel;

/** The vehicle and problem in one line, e.g. "Car · Battery". */
export const vehicleSummary = (receipt: Pick<Receipt, 'vehicleType' | 'problemType'>) =>
  requestStrings.vehicleAndProblem(
    requestStrings.vehicleOptions[receipt.vehicleType],
    requestStrings.problemOptions[receipt.problemType],
  );

/** A person with their truck, e.g. "Sami Trabelsi (Wheel-lift)". */
export const driverWithTruck = (driver: Receipt['driver']) =>
  translate('trip:driverWithTruck', { name: driver.fullName, truck: truckLabel(driver.truckType) });

/**
 * The receipt as plain text for sharing. Only what the receipt carries: it has
 * no phone number and no plate, so neither can end up in a shared message.
 */
export function formatReceiptText(receipt: Receipt): string {
  const language = currentLanguage();
  // Receipts are dated in Tunisian time; English uses the day-month-year order of the shared text.
  const completed = formatDateTime(
    receipt.completedAt,
    language === 'en' ? 'en-GB' : language,
    'Africa/Tunis',
  );
  const line = (key: string, value: string) => translate(`trip:receiptText.${key}`, { value });
  return [
    translate('trip:receiptText.title'),
    line('number', receipt.receiptNo),
    line('date', completed),
    line('from', receipt.pickup.address),
    line('to', receipt.dropoff.address),
    line('vehicle', vehicleSummary(receipt)),
    line('distance', formatKilometres(receipt.distanceM)),
    line('driver', driverWithTruck(receipt.driver)),
    line('customer', receipt.customer.fullName),
    line('paid', formatMoney(receipt.agreedFare)),
  ].join('\n');
}
