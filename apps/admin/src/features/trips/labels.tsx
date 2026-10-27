import type { TowRequestStatus } from '@depanini/shared';

import { useEnumLabel } from '../../i18n/enums';
import { Badge, type Tone } from '../../ui/Badge';

const TONE: Record<TowRequestStatus, Tone> = {
  open: 'warning',
  assigned: 'warning',
  completed: 'success',
  cancelled: 'danger',
  expired: 'neutral',
};

export function TripStatusBadge({ status }: { status: TowRequestStatus }) {
  const label = useEnumLabel();
  return <Badge tone={TONE[status]}>{label('tripStatus', status)}</Badge>;
}
