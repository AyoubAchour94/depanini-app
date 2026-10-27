import type { PaymentStatus, ReportCategory, ReportStatus } from '@depanini/shared';
import type { TFunction } from 'i18next';

import { formatDateTime, formatDecimal, formatTime } from '@/i18n/format';
import { liveStrings, useStrings } from '@/i18n';

/** User-facing text of the trip detail and receipt, shared by both apps. The messages live in `i18n/locales/<lng>/trip.json`. */
export const createTripStrings = (t: TFunction) => ({
  pickupLabel: t('trip:pickupLabel'),
  dropoffLabel: t('trip:dropoffLabel'),
  fareLabel: t('trip:fareLabel'),
  stagesTitle: t('trip:stagesTitle'),
  stages: {
    assigned: t('trip:stages.assigned'),
    enRoute: t('trip:stages.enRoute'),
    arrived: t('trip:stages.arrived'),
    towing: t('trip:stages.towing'),
    completed: t('trip:stages.completed'),
  },
  time: (iso: string) => formatTime(iso),
  paymentStatus: {
    driver_confirmed: t('trip:paymentStatus.driver_confirmed'),
    customer_confirmed: t('trip:paymentStatus.customer_confirmed'),
    disputed: t('trip:paymentStatus.disputed'),
  } satisfies Record<PaymentStatus, string>,
  receiptTitle: t('trip:receiptTitle'),
  receiptLoading: t('trip:receiptLoading'),
  receiptFailed: t('trip:receiptFailed'),
  receiptNotFound: t('trip:receiptNotFound'),
  retry: t('trip:retry'),
  receiptNumber: t('trip:receiptNumber'),
  receiptDate: t('trip:receiptDate'),
  vehicleLabel: t('trip:vehicleLabel'),
  distanceLabel: t('trip:distanceLabel'),
  driverLabel: t('trip:driverLabel'),
  customerLabel: t('trip:customerLabel'),
  paidInCash: t('trip:paidInCash'),
  dateTime: (iso: string) => formatDateTime(iso),
  share: t('trip:share'),
  copied: t('trip:copied'),
  shareFailed: t('trip:shareFailed'),
  rateDriverTitle: t('trip:rateDriverTitle'),
  rateCustomerTitle: t('trip:rateCustomerTitle'),
  starsLabel: (n: number) => t('trip:starsLabel', { count: n }),
  starsGroup: t('trip:starsGroup'),
  tagsLabel: t('trip:tagsLabel'),
  tagsRequired: t('trip:tagsRequired'),
  pickStars: t('trip:pickStars'),
  commentLabel: t('trip:commentLabel'),
  commentCounter: (used: number, max: number) => t('trip:commentCounter', { used, max }),
  sendRating: t('trip:sendRating'),
  ratingFailed: t('trip:ratingFailed'),
  thanksForRating: t('trip:thanksForRating'),
  youRated: (n: number) => t('trip:youRated', { stars: t('trip:starsLabel', { count: n }) }),
  ratingNew: t('trip:ratingNew'),
  ratingBadge: (average: number, count: number) =>
    t('trip:ratingBadge', { average: formatDecimal(average), votes: count }),
  reportLink: t('trip:reportLink'),
  reportCategoryLabel: t('trip:reportCategoryLabel'),
  reportCategories: {
    safety: t('trip:reportCategories.safety'),
    vehicle_damage: t('trip:reportCategories.vehicle_damage'),
    overcharged: t('trip:reportCategories.overcharged'),
    no_show: t('trip:reportCategories.no_show'),
    behaviour: t('trip:reportCategories.behaviour'),
    other: t('trip:reportCategories.other'),
  } satisfies Record<ReportCategory, string>,
  reportNoteLabel: t('trip:reportNoteLabel'),
  reportNoteCounter: (used: number, max: number) => t('trip:reportNoteCounter', { used, max }),
  reportSend: t('trip:reportSend'),
  reportBack: t('trip:reportBack'),
  reportSent: t('trip:reportSent'),
  reportFailed: t('trip:reportFailed'),
  reportConflict: t('trip:reportConflict'),
  reportsTitle: t('trip:reportsTitle'),
  reportStatus: {
    open: t('trip:reportStatus.open'),
    resolved: t('trip:reportStatus.resolved'),
  } satisfies Record<ReportStatus, string>,
  reportResolution: (note: string) => t('trip:reportResolution', { note }),
});

/** The messages for a component: re-renders it when the language changes. */
export const useTripStrings = () => useStrings(createTripStrings);

/** The messages for event handlers and other code outside React. */
export const tripStrings = liveStrings(createTripStrings);
