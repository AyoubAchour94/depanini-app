import type { DocumentKind, VerificationStatus } from '@depanini/shared';

import { Badge, type Tone } from '../../ui/Badge';

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  unsubmitted: 'Not submitted',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_TONE: Record<VerificationStatus, Tone> = {
  unsubmitted: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export const KIND_LABEL: Record<DocumentKind, string> = {
  licence: "Driver's licence",
  registration: 'Vehicle registration',
  insurance: 'Insurance certificate',
  national_id: 'National ID',
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '-';
}

/** `flatbed` or `tow_truck` as readable text. */
export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
