import { REPORT_STATUSES, reportStatusSchema } from '@depanini/shared';
import type { AdminDisputeItem } from '@depanini/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useDisputes, useResolveDispute } from '../../api/lookups';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { formatMoney } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Input';
import { PagedList } from '../../ui/PagedList';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';
import { ReportStatusBadge, useResolvedBy } from './labels';
import { ResolveDialog } from './ResolveDialog';

function ResolveDisputeDialog({
  dispute,
  onClose,
}: {
  dispute: AdminDisputeItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const resolve = useResolveDispute(dispute.requestId);
  return (
    <ResolveDialog
      title={t('queues:disputes.resolveTitle', { receipt: dispute.receiptNo })}
      noteLabel={t('queues:disputes.noteLabel')}
      resolve={resolve}
      onClose={onClose}
    />
  );
}

/** Payments the customer disputed; open ones first by default. */
export function DisputesPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const resolvedBy = useResolvedBy();
  const [params, setParams] = useSearchParams();
  const parsed = reportStatusSchema.safeParse(params.get('status'));
  const filter = params.get('status') === 'all' ? undefined : parsed.success ? parsed.data : 'open';
  const disputes = useDisputes(filter);
  const [resolving, setResolving] = useState<AdminDisputeItem | null>(null);
  const rows = disputes.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>{t('queues:disputes.title')}</h1>
      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <Select
          label={t('common:status')}
          value={filter ?? 'all'}
          onChange={(event) => setParams({ status: event.target.value })}
        >
          {REPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {label('reportStatus', value)}
            </option>
          ))}
          <option value="all">{t('common:all')}</option>
        </Select>
      </div>
      <PagedList query={disputes} failure={t('queues:disputes.loadFailed')}>
        <Table
          caption={t('queues:disputes.caption')}
          rows={rows}
          rowKey={(dispute) => dispute.requestId}
          empty={filter === 'open' ? t('queues:disputes.openEmpty') : t('queues:disputes.empty')}
          columns={[
            {
              header: t('queues:columns.receipt'),
              cell: (dispute) => (
                <Link to={`/trips/${dispute.requestId}`}>{dispute.receiptNo}</Link>
              ),
            },
            {
              header: t('queues:columns.amount'),
              cell: (dispute) => formatMoney(dispute.amountTnd),
            },
            {
              header: t('queues:columns.customer'),
              cell: (dispute) => dispute.customerName ?? '-',
            },
            { header: t('queues:columns.driver'), cell: (dispute) => dispute.driverName ?? '-' },
            {
              header: t('queues:columns.customerSays'),
              cell: (dispute) => dispute.disputeNote ?? '-',
            },
            {
              header: t('queues:columns.disputed'),
              cell: (dispute) => formatDate(dispute.disputedAt),
            },
            {
              header: t('queues:columns.status'),
              cell: (dispute) =>
                dispute.status === 'open' ? (
                  <>
                    <ReportStatusBadge status="open" />{' '}
                    <Button onClick={() => setResolving(dispute)}>{t('queues:resolve')}</Button>
                  </>
                ) : (
                  <>
                    <ReportStatusBadge status="resolved" />
                    <div className="muted">
                      {resolvedBy(dispute.resolvedByEmail, dispute.resolvedAt)}
                    </div>
                    <div>{dispute.resolutionNote}</div>
                  </>
                ),
            },
          ]}
        />
      </PagedList>
      {resolving ? (
        <ResolveDisputeDialog dispute={resolving} onClose={() => setResolving(null)} />
      ) : null}
    </>
  );
}
