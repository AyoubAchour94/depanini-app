import { REPORT_STATUSES, reportStatusSchema } from '@depanini/shared';
import type { AdminDisputeItem } from '@depanini/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useDisputes, useResolveDispute } from '../../api/lookups';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Input';
import { PagedList } from '../../ui/PagedList';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';
import { dinars } from '../trips/labels';
import { REPORT_STATUS_LABEL, ReportStatusBadge, resolvedBy } from './labels';
import { ResolveDialog } from './ResolveDialog';

function ResolveDisputeDialog({
  dispute,
  onClose,
}: {
  dispute: AdminDisputeItem;
  onClose: () => void;
}) {
  const resolve = useResolveDispute(dispute.requestId);
  return (
    <ResolveDialog
      title={`Resolve the dispute on ${dispute.receiptNo}?`}
      noteLabel="Resolution note (kept on the payment)"
      resolve={resolve}
      onClose={onClose}
    />
  );
}

/** Payments the customer disputed; open ones first by default. */
export function DisputesPage() {
  const [params, setParams] = useSearchParams();
  const parsed = reportStatusSchema.safeParse(params.get('status'));
  const filter = params.get('status') === 'all' ? undefined : parsed.success ? parsed.data : 'open';
  const disputes = useDisputes(filter);
  const [resolving, setResolving] = useState<AdminDisputeItem | null>(null);
  const rows = disputes.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>Payment disputes</h1>
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
      <PagedList query={disputes} failure="Could not load the disputes.">
        <Table
          caption="Payment disputes"
          rows={rows}
          rowKey={(dispute) => dispute.requestId}
          empty={filter === 'open' ? 'No open disputes.' : 'No disputes found.'}
          columns={[
            {
              header: 'Receipt',
              cell: (dispute) => (
                <Link to={`/trips/${dispute.requestId}`}>{dispute.receiptNo}</Link>
              ),
            },
            { header: 'Amount', cell: (dispute) => dinars(dispute.amountTnd) },
            { header: 'Customer', cell: (dispute) => dispute.customerName ?? '-' },
            { header: 'Driver', cell: (dispute) => dispute.driverName ?? '-' },
            { header: 'Customer says', cell: (dispute) => dispute.disputeNote ?? '-' },
            { header: 'Disputed', cell: (dispute) => formatDate(dispute.disputedAt) },
            {
              header: 'Status',
              cell: (dispute) =>
                dispute.status === 'open' ? (
                  <>
                    <ReportStatusBadge status="open" />{' '}
                    <Button onClick={() => setResolving(dispute)}>Resolve</Button>
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
