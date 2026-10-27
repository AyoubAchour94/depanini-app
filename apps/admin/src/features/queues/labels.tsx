import type { ReportStatus } from '@depanini/shared';

import { useEnumLabel } from '../../i18n/enums';
import { useTranslation } from '../../i18n';
import { Badge } from '../../ui/Badge';
import { formatDate } from '../drivers/labels';

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const label = useEnumLabel();
  return (
    <Badge tone={status === 'open' ? 'warning' : 'success'}>{label('reportStatus', status)}</Badge>
  );
}

/** "Resolved by a@b.c on 19 Oct 2026" (the parts that are known). */
export function useResolvedBy() {
  const { t } = useTranslation();
  return (email: string | null | undefined, at: string | null | undefined) =>
    t('queues:resolvedBy', { who: email ?? t('queues:anAdmin'), date: formatDate(at) });
}
