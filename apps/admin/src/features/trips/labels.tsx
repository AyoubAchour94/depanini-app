import type { TowRequestStatus } from '@depanini/shared';

import { Badge, type Tone } from '../../ui/Badge';
import { humanize } from '../drivers/labels';

const TONE: Record<TowRequestStatus, Tone> = {
  open: 'warning',
  assigned: 'warning',
  completed: 'success',
  cancelled: 'danger',
  expired: 'neutral',
};

export function TripStatusBadge({ status }: { status: TowRequestStatus }) {
  return <Badge tone={TONE[status]}>{humanize(status)}</Badge>;
}

/** Whole dinars as text. */
export const dinars = (amount: number | null | undefined) =>
  amount == null ? '-' : `${amount} TND`;
