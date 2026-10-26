import type { DocumentKind } from '@depanini/shared';
import type { TFunction } from 'i18next';

import { formatDecimal } from '@/i18n/format';
import { liveStrings, useStrings } from '@/i18n';

/** User-facing text of the driver verification screen and the home card. The messages live in `i18n/locales/<lng>/verification.json`. */
export const createVerificationStrings = (t: TFunction) => ({
  title: t('verification:title'),
  loading: t('verification:loading'),
  loadFailed: t('verification:loadFailed'),
  retry: t('verification:retry'),
  kindLabels: {
    licence: t('verification:kindLabels.licence'),
    registration: t('verification:kindLabels.registration'),
    insurance: t('verification:kindLabels.insurance'),
    national_id: t('verification:kindLabels.national_id'),
  } satisfies Record<DocumentKind, string>,
  intro: t('verification:intro'),
  pending: t('verification:pending'),
  approved: t('verification:approved'),
  rejected: (reason: string | null | undefined) =>
    reason ? t('verification:rejected', { reason }) : t('verification:rejectedNoReason'),
  rejectedHint: t('verification:rejectedHint'),
  missing: t('verification:missing'),
  uploaded: (pages: number) => t('verification:uploaded', { count: pages }),
  rejectedRow: (pages: number) => t('verification:rejectedRow', { count: pages }),
  pageLine: (page: number, type: string, bytes: number) =>
    t('verification:pageLine', {
      page,
      type,
      size: t('verification:sizeMb', { value: formatDecimal(bytes / (1024 * 1024)) }),
    }),
  pdf: t('verification:pdf'),
  photo: t('verification:photo'),
  takePhoto: t('verification:takePhoto'),
  choosePhoto: t('verification:choosePhoto'),
  addPdf: t('verification:addPdf'),
  forKind: (action: string, kind: string) => t('verification:forKind', { action, kind }),
  removePage: (page: number) => t('verification:removePage', { page }),
  uploading: t('verification:uploading'),
  submit: t('verification:submit'),
  incomplete: t('verification:incomplete'),
  submitFailed: t('verification:submitFailed'),
  errors: {
    denied: t('verification:errors.denied'),
    wrongType: t('verification:errors.wrongType'),
    tooLarge: t('verification:errors.tooLarge'),
    failed: t('verification:errors.failed'),
    uploadFailed: t('verification:errors.uploadFailed'),
    removeFailed: t('verification:errors.removeFailed'),
    locked: t('verification:errors.locked'),
    uploadLimit: t('verification:errors.uploadLimit'),
    tooManyRequests: t('verification:errors.tooManyRequests'),
  },
  homeCardTitle: t('verification:homeCardTitle'),
  homeCardOpen: t('verification:homeCardOpen'),
  homeCardStatus: {
    unsubmitted: t('verification:homeCardStatus.unsubmitted'),
    pending: t('verification:homeCardStatus.pending'),
    rejected: (reason: string | null | undefined) =>
      reason ? t('verification:rejected', { reason }) : t('verification:rejectedNoReason'),
  },
  homeApprovedNotice: t('verification:homeApprovedNotice'),
  homeApprovedDismiss: t('verification:homeApprovedDismiss'),
});

/** The messages for a component: re-renders it when the language changes. */
export const useVerificationStrings = () => useStrings(createVerificationStrings);

/** The messages for event handlers and other code outside React. */
export const verificationStrings = liveStrings(createVerificationStrings);
