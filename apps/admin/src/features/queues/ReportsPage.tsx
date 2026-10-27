import { REPORT_STATUSES, reportStatusSchema } from '@depanini/shared';
import type { AdminReportItem } from '@depanini/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useReports, useResolveReport } from '../../api/lookups';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Input';
import { PagedList } from '../../ui/PagedList';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';
import { ReportStatusBadge, useResolvedBy } from './labels';
import { ResolveDialog } from './ResolveDialog';

function ResolveReportDialog({
  report,
  onClose,
}: {
  report: AdminReportItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const resolve = useResolveReport(report.id);
  return (
    <ResolveDialog
      title={t('queues:reports.resolveTitle', {
        category: label('reportCategory', report.category).toLowerCase(),
      })}
      noteLabel={t('queues:reports.noteLabel')}
      resolve={resolve}
      onClose={onClose}
    />
  );
}

/** Reports from customers and drivers; open ones first by default. */
export function ReportsPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const resolvedBy = useResolvedBy();
  const [params, setParams] = useSearchParams();
  const parsed = reportStatusSchema.safeParse(params.get('status'));
  // Open reports are the work: they are what shows until the filter says otherwise.
  const filter = params.get('status') === 'all' ? undefined : parsed.success ? parsed.data : 'open';
  const reports = useReports(filter);
  const [resolving, setResolving] = useState<AdminReportItem | null>(null);
  const rows = reports.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>{t('queues:reports.title')}</h1>
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
      <PagedList query={reports} failure={t('queues:reports.loadFailed')}>
        <Table
          caption={t('queues:reports.caption')}
          rows={rows}
          rowKey={(report) => report.id}
          empty={filter === 'open' ? t('queues:reports.openEmpty') : t('queues:reports.empty')}
          columns={[
            {
              header: t('queues:columns.category'),
              cell: (report) => label('reportCategory', report.category),
            },
            {
              header: t('queues:columns.reporter'),
              cell: (report) =>
                t('queues:reporter', {
                  name: report.reporterName ?? t('queues:unknownReporter'),
                  role: label('party', report.reporterRole).toLowerCase(),
                }),
            },
            { header: t('queues:columns.note'), cell: (report) => report.note },
            {
              header: t('queues:columns.trip'),
              cell: (report) => (
                <Link to={`/trips/${report.requestId}`}>
                  {report.pickupAddress ?? t('queues:tripFallback')}
                </Link>
              ),
            },
            {
              header: t('queues:columns.reported'),
              cell: (report) => formatDate(report.createdAt),
            },
            {
              header: t('queues:columns.status'),
              cell: (report) =>
                report.status === 'open' ? (
                  <>
                    <ReportStatusBadge status="open" />{' '}
                    <Button onClick={() => setResolving(report)}>{t('queues:resolve')}</Button>
                  </>
                ) : (
                  <>
                    <ReportStatusBadge status="resolved" />
                    <div className="muted">
                      {resolvedBy(report.resolvedByEmail, report.resolvedAt)}
                    </div>
                    <div>{report.resolutionNote}</div>
                  </>
                ),
            },
          ]}
        />
      </PagedList>
      {resolving ? (
        <ResolveReportDialog report={resolving} onClose={() => setResolving(null)} />
      ) : null}
    </>
  );
}
