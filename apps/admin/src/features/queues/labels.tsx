import type { ReportCategory, ReportStatus } from '@depanini/shared';

import { Badge } from '../../ui/Badge';
import { formatDate } from '../drivers/labels';

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  safety: 'Safety',
  vehicle_damage: 'Vehicle damage',
  overcharged: 'Overcharged',
  no_show: 'No-show',
  behaviour: 'Behaviour',
  other: 'Other',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Badge tone={status === 'open' ? 'warning' : 'success'}>{REPORT_STATUS_LABEL[status]}</Badge>
  );
}

/** "Resolved by a@b.c on 19/10/2026" (the parts that are known). */
export function resolvedBy(email: string | null | undefined, at: string | null | undefined) {
  return `Resolved by ${email ?? 'an admin'} on ${formatDate(at)}`;
}
