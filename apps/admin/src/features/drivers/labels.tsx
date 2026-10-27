import type { VerificationStatus } from '@depanini/shared';

import { useEnumLabel } from '../../i18n/enums';
import { formatDateTime } from '../../i18n/format';
import { Badge, type Tone } from '../../ui/Badge';

const STATUS_TONE: Record<VerificationStatus, Tone> = {
  unsubmitted: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const label = useEnumLabel();
  return <Badge tone={STATUS_TONE[status]}>{label('verification', status)}</Badge>;
}

/** The date and time in the active language; "-" when unknown. */
export const formatDate = formatDateTime;
