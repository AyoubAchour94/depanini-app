import { REPORT_STATUSES, reportStatusSchema } from '@depanini/shared';
import type { AdminReportItem } from '@depanini/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useReports, useResolveReport } from '../../api/lookups';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Input';
import { PagedList } from '../../ui/PagedList';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';
import { CATEGORY_LABEL, REPORT_STATUS_LABEL, ReportStatusBadge, resolvedBy } from './labels';
import { ResolveDialog } from './ResolveDialog';

function ResolveReportDialog({
  report,
  onClose,
}: {
  report: AdminReportItem;
  onClose: () => void;
}) {
  const resolve = useResolveReport(report.id);
  return (
    <ResolveDialog
      title={`Resolve ${CATEGORY_LABEL[report.category].toLowerCase()} report?`}
      noteLabel="Resolution note (the reporter sees it)"
      resolve={resolve}
      onClose={onClose}
    />
  );
}

/** Reports from customers and drivers; open ones first by default. */
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const parsed = reportStatusSchema.safeParse(params.get('status'));
  // Open reports are the work: they are what shows until the filter says otherwise.
  const filter = params.get('status') === 'all' ? undefined : parsed.success ? parsed.data : 'open';
  const reports = useReports(filter);
  const [resolving, setResolving] = useState<AdminReportItem | null>(null);
  const rows = reports.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>Reports</h1>
      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <Select
          label="Status"
          value={filter ?? 'all'}
          onChange={(event) => setParams({ status: event.target.value })}
        >
          {REPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {REPORT_STATUS_LABEL[value]}
            </option>
          ))}
          <option value="all">All</option>
        </Select>
      </div>
      <PagedList query={reports} failure="Could not load the reports.">
        <Table
          caption="Reports"
          rows={rows}
          rowKey={(report) => report.id}
          empty={filter === 'open' ? 'No open reports.' : 'No reports found.'}
          columns={[
            { header: 'Category', cell: (report) => CATEGORY_LABEL[report.category] },
            {
              header: 'Reporter',
              cell: (report) => `${report.reporterName ?? 'Unknown'} (${report.reporterRole})`,
            },
            { header: 'Note', cell: (report) => report.note },
            {
              header: 'Trip',
              cell: (report) => (
                <Link to={`/trips/${report.requestId}`}>{report.pickupAddress ?? 'Trip'}</Link>
              ),
            },
            { header: 'Reported', cell: (report) => formatDate(report.createdAt) },
            {
              header: 'Status',
              cell: (report) =>
                report.status === 'open' ? (
                  <>
                    <ReportStatusBadge status="open" />{' '}
                    <Button onClick={() => setResolving(report)}>Resolve</Button>
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
