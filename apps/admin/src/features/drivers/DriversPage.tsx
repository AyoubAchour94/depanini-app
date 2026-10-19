import {
  VERIFICATION_STATUSES,
  type VerificationStatus,
  verificationStatusSchema,
} from '@depanini/shared';
import { Link, useSearchParams } from 'react-router';

import { useDrivers } from '../../api/drivers';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Input';
import { Table } from '../../ui/Table';
import { formatDate, humanize, STATUS_LABEL, StatusBadge } from './labels';

/** Pending reviews first; the API's order is kept within each group. */
function pendingFirst<T extends { verificationStatus: VerificationStatus }>(rows: T[]): T[] {
  const rank = (row: T) => (row.verificationStatus === 'pending' ? 0 : 1);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * The driver list. In `queue` mode it shows the pending drivers only (oldest submission
 * first); otherwise all drivers, pending first, with a status filter.
 */
export function DriversPage({ mode }: { mode: 'queue' | 'all' }) {
  const [params, setParams] = useSearchParams();
  const filter = verificationStatusSchema.safeParse(params.get('status'));
  const status = mode === 'queue' ? 'pending' : filter.success ? filter.data : undefined;
  const drivers = useDrivers(status);

  const rows = drivers.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>{mode === 'queue' ? 'Review queue' : 'Drivers'}</h1>
      {mode === 'all' ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Select
            label="Status"
            value={status ?? ''}
            onChange={(event) =>
              setParams(event.target.value ? { status: event.target.value } : {})
            }
          >
            <option value="">All</option>
            {VERIFICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {drivers.isPending ? <p className="muted">Loading…</p> : null}
      {drivers.isError ? (
        <p role="alert" className="error">
          Could not load the drivers.
        </p>
      ) : null}
      {drivers.isSuccess ? (
        <Table
          caption={mode === 'queue' ? 'Drivers waiting for review' : 'Drivers'}
          rows={mode === 'queue' ? rows : pendingFirst(rows)}
          rowKey={(driver) => driver.userId}
          empty={mode === 'queue' ? 'No drivers are waiting for review.' : 'No drivers found.'}
          columns={[
            {
              header: 'Name',
              cell: (driver) => <Link to={`/drivers/${driver.userId}`}>{driver.fullName}</Link>,
            },
            { header: 'Phone', cell: (driver) => driver.phone },
            { header: 'Truck', cell: (driver) => humanize(driver.truckType) },
            { header: 'Plate', cell: (driver) => driver.plateNumber },
            {
              header: 'Status',
              cell: (driver) => <StatusBadge status={driver.verificationStatus} />,
            },
            { header: 'Submitted', cell: (driver) => formatDate(driver.submittedAt) },
          ]}
        />
      ) : null}
      {drivers.hasNextPage ? (
        <p>
          <Button
            onClick={() => void drivers.fetchNextPage()}
            disabled={drivers.isFetchingNextPage}
          >
            Load more
          </Button>
        </p>
      ) : null}
    </>
  );
}
