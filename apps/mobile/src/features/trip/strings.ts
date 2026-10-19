import type { PaymentStatus } from '@depanini/shared';

/** User-facing text of the trip detail and receipt, shared by both apps. */
export const tripStrings = {
  pickupLabel: 'Pickup',
  dropoffLabel: 'Drop-off',
  fareLabel: 'Fare',
  stagesTitle: 'Trip times',
  stages: {
    assigned: 'Accepted',
    enRoute: 'On the way',
    arrived: 'Arrived',
    towing: 'Towing',
    completed: 'Completed',
  },
  /** Local time of day, e.g. "10:05". */
  time: (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

  paymentStatus: {
    driver_confirmed: 'Cash received',
    customer_confirmed: 'Confirmed by customer',
    disputed: 'Disputed',
  } satisfies Record<PaymentStatus, string>,

  receiptTitle: 'Receipt',
  receiptLoading: 'Loading the receipt…',
  receiptFailed: 'Could not load the receipt.',
  receiptNotFound: 'This receipt is not available.',
  retry: 'Try again',
  receiptNumber: 'Receipt no.',
  receiptDate: 'Date',
  vehicleLabel: 'Vehicle',
  distanceLabel: 'Distance',
  driverLabel: 'Driver',
  customerLabel: 'Customer',
  paidInCash: 'Paid in cash',
  /** Local date and time, e.g. "Jan 1, 2026, 10:05 AM". */
  dateTime: (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),

  share: 'Share receipt',
  copied: 'Copied',
  shareFailed: 'Could not share the receipt.',
};
