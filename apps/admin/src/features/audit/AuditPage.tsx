import type { AuditEntry } from '@depanini/shared';
import { Link } from 'react-router';

import { useAudit } from '../../api/lookups';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { PagedList } from '../../ui/PagedList';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';

/** Where the target of an action lives in this app, if anywhere. */
function targetPath(entry: AuditEntry): string | null {
  if (entry.targetType === 'driver') return `/drivers/${entry.targetId}`;
  if (entry.targetType === 'dispute') return `/trips/${entry.targetId}`;
  const requestId = entry.details?.requestId;
  return typeof requestId === 'string' ? `/trips/${requestId}` : null;
}

/** What the admin wrote: the rejection reason or the resolution note. */
function detailText(entry: AuditEntry): string {
  const text = entry.details?.note ?? entry.details?.reason;
  return typeof text === 'string' ? text : '';
}

/** Everything admins did, newest first. */
export function AuditPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const audit = useAudit();
  const rows = audit.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>{t('audit:title')}</h1>
      <PagedList query={audit} failure={t('audit:loadFailed')}>
        <Table
          caption={t('audit:caption')}
          rows={rows}
          rowKey={(entry) => entry.id}
          empty={t('audit:empty')}
          columns={[
            { header: t('audit:columns.when'), cell: (entry) => formatDate(entry.createdAt) },
            {
              header: t('audit:columns.admin'),
              cell: (entry) => entry.adminEmail ?? entry.adminUserId,
            },
            {
              header: t('audit:columns.action'),
              cell: (entry) => label('auditAction', entry.action),
            },
            {
              header: t('audit:columns.target'),
              cell: (entry) => {
                const path = targetPath(entry);
                const text = label('auditTarget', entry.targetType);
                return path ? <Link to={path}>{text}</Link> : text;
              },
            },
            { header: t('audit:columns.note'), cell: detailText },
          ]}
        />
      </PagedList>
    </>
  );
}
