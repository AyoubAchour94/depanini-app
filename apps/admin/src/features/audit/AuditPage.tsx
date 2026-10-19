import type { AdminAction, AuditEntry } from '@depanini/shared';
import { Link } from 'react-router';

import { useAudit } from '../../api/lookups';
import { PagedList } from '../../ui/PagedList';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';

const ACTION_LABEL: Record<AdminAction, string> = {
  driver_approved: 'Approved a driver',
  driver_rejected: 'Rejected a driver',
  report_resolved: 'Resolved a report',
  dispute_resolved: 'Resolved a payment dispute',
};

/** Where the target of an action lives in this app, if anywhere. */
function targetPath(entry: AuditEntry): string | null {
  if (entry.targetType === 'driver') return `/drivers/${entry.targetId}`;
  if (entry.targetType === 'dispute') return `/trips/${entry.targetId}`;
  const requestId = entry.details?.requestId;
  return typeof requestId === 'string' ? `/trips/${requestId}` : null;
}

const TARGET_LABEL: Record<AuditEntry['targetType'], string> = {
  driver: 'Driver',
  report: 'Report',
  dispute: 'Dispute',
};

/** What the admin wrote: the rejection reason or the resolution note. */
function detailText(entry: AuditEntry): string {
  const text = entry.details?.note ?? entry.details?.reason;
  return typeof text === 'string' ? text : '';
}

/** Everything admins did, newest first. */
export function AuditPage() {
  const audit = useAudit();
  const rows = audit.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>Audit log</h1>
      <PagedList query={audit} failure="Could not load the audit log.">
        <Table
          caption="Admin actions"
          rows={rows}
          rowKey={(entry) => entry.id}
          empty="No admin actions yet."
          columns={[
            { header: 'When', cell: (entry) => formatDate(entry.createdAt) },
            { header: 'Admin', cell: (entry) => entry.adminEmail ?? entry.adminUserId },
            { header: 'Action', cell: (entry) => ACTION_LABEL[entry.action] },
            {
              header: 'Target',
              cell: (entry) => {
                const path = targetPath(entry);
                const label = TARGET_LABEL[entry.targetType];
                return path ? <Link to={path}>{label}</Link> : label;
              },
            },
            { header: 'Note', cell: detailText },
          ]}
        />
      </PagedList>
    </>
  );
}
