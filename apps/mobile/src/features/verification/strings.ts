import type { DocumentKind } from '@depanini/shared';

/** User-facing text of the driver verification screen and the home card. */
export const verificationStrings = {
  title: 'Verification',
  loading: 'Loading your documents…',
  loadFailed: 'Could not load your documents. Check your connection and try again.',
  retry: 'Try again',

  kindLabels: {
    licence: "Driver's licence",
    registration: 'Vehicle registration (carte grise)',
    insurance: 'Insurance certificate',
    national_id: 'National ID (CIN)',
  } satisfies Record<DocumentKind, string>,

  /** The status banner, by verification status. */
  intro: 'Upload each document as a photo or a PDF (5 MB at most) to start taking jobs.',
  pending: 'Under review. We will notify you as soon as we have checked your documents.',
  approved: 'Approved. You can go online.',
  rejected: (reason: string | null | undefined) =>
    reason ? `Rejected: ${reason}` : 'Rejected. Upload your documents again.',
  rejectedHint: 'Fix the documents below and send them again.',

  missing: 'Missing',
  uploaded: (pages: number) => (pages === 1 ? 'Uploaded (1 page)' : `Uploaded (${pages} pages)`),
  rejectedRow: (pages: number) => `Rejected (${pages === 1 ? '1 page' : `${pages} pages`})`,
  pageLine: (page: number, type: string, bytes: number) =>
    `Page ${page} · ${type} · ${(bytes / (1024 * 1024)).toFixed(1)} MB`,
  pdf: 'PDF',
  photo: 'Photo',

  takePhoto: 'Take photo',
  choosePhoto: 'Choose photo',
  addPdf: 'Add PDF',
  /** Accessibility label of an action for one kind, so each row's buttons are distinct. */
  forKind: (action: string, kind: string) => `${action}: ${kind}`,
  removePage: (page: number) => `Remove page ${page}`,
  uploading: 'Uploading…',

  submit: 'Submit for review',
  incomplete: 'Add at least one page of every document to submit.',
  submitFailed: 'Could not submit your documents. Try again.',

  errors: {
    denied:
      'Camera access is needed to take a photo. Allow it in your settings, or choose a photo.',
    wrongType: 'That file type is not accepted. Use a JPEG or PNG photo, or a PDF.',
    tooLarge: 'That file is too large. Use a file of 5 MB at most.',
    failed: 'Could not read that file. Try another one.',
    uploadFailed: 'Could not upload that file. Try again.',
    removeFailed: 'Could not remove that page. Try again.',
    locked: 'Your documents are under review, so they cannot be changed.',
    uploadLimit: 'You have uploaded a lot of files in a short time. Wait a while, then try again.',
    tooManyRequests: 'Too many attempts. Wait a moment, then try again.',
  },

  /** The driver home card while the driver is not approved. */
  homeCardTitle: 'Verify your account to go online',
  homeCardOpen: 'Open verification',
  homeCardStatus: {
    unsubmitted: 'Upload your documents so we can check them.',
    pending: 'Under review. We will notify you when we have checked your documents.',
    rejected: (reason: string | null | undefined) =>
      reason ? `Rejected: ${reason}` : 'Rejected. Upload your documents again.',
  },
  homeApprovedNotice: 'Your documents are approved. You can go online now.',
  homeApprovedDismiss: 'Dismiss',
};
