import type { PaymentStatus, ReportCategory, ReportStatus } from '@depanini/shared';

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

  rateDriverTitle: 'Rate your driver',
  rateCustomerTitle: 'Rate your customer',
  starsLabel: (n: number) => (n === 1 ? '1 star' : `${n} stars`),
  starsGroup: 'Stars',
  tagsLabel: 'What stood out?',
  tagsRequired: 'Tell us what went wrong: pick at least one tag.',
  pickStars: 'Pick a rating.',
  commentLabel: 'Comment (optional)',
  commentCounter: (used: number, max: number) => `${used}/${max}`,
  sendRating: 'Send rating',
  ratingFailed: 'Could not send your rating. Try again.',
  thanksForRating: 'Thanks for rating',
  youRated: (n: number) => `You gave ${n === 1 ? '1 star' : `${n} stars`}`,
  ratingNew: 'New',
  ratingBadge: (average: number, count: number) => `★ ${average.toFixed(1)} (${count})`,

  reportLink: 'Report a problem with this trip',
  reportCategoryLabel: 'What went wrong?',
  reportCategories: {
    safety: 'Safety',
    vehicle_damage: 'Vehicle damage',
    overcharged: 'Overcharged',
    no_show: 'No-show',
    behaviour: 'Behaviour',
    other: 'Other',
  } satisfies Record<ReportCategory, string>,
  reportNoteLabel: 'What happened?',
  reportNoteCounter: (used: number, max: number) => `${used}/${max}`,
  reportSend: 'Send report',
  reportBack: 'Back',
  reportSent: 'Report sent',
  reportFailed: 'Could not send your report. Try again.',
  reportConflict: 'This trip can no longer be reported, or you already have an open report on it.',
  reportsTitle: 'Your reports',
  reportStatus: { open: 'Open', resolved: 'Resolved' } satisfies Record<ReportStatus, string>,
  reportResolution: (note: string) => `Resolution: ${note}`,
};
