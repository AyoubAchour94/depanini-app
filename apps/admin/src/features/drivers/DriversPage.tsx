import {
  VERIFICATION_STATUSES,
  type VerificationStatus,
  verificationStatusSchema,
} from '@depanini/shared';
import { Link, useSearchParams } from 'react-router';

import { useDrivers } from '../../api/drivers';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Input';
import { Table } from '../../ui/Table';
import { formatDate, StatusBadge } from './labels';

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
  const { t } = useTranslation();
  const label = useEnumLabel();
  const [params, setParams] = useSearchParams();
  const filter = verificationStatusSchema.safeParse(params.get('status'));
  const status = mode === 'queue' ? 'pending' : filter.success ? filter.data : undefined;
  const drivers = useDrivers(status);

  const rows = drivers.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>{mode === 'queue' ? t('drivers:queueTitle') : t('drivers:title')}</h1>
      {mode === 'all' ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Select
            label={t('common:status')}
            value={status ?? ''}
            onChange={(event) =>
              setParams(event.target.value ? { status: event.target.value } : {})
            }
          >
            <option value="">{t('common:all')}</option>
            {VERIFICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {label('verification', value)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {drivers.isPending ? <p className="muted">{t('common:loading')}</p> : null}
      {drivers.isError ? (
        <p role="alert" className="error">
          {t('drivers:loadFailed')}
        </p>
      ) : null}
      {drivers.isSuccess ? (
        <Table
          caption={mode === 'queue' ? t('drivers:queueCaption') : t('drivers:title')}
          rows={mode === 'queue' ? rows : pendingFirst(rows)}
          rowKey={(driver) => driver.userId}
          empty={mode === 'queue' ? t('drivers:queueEmpty') : t('drivers:empty')}
          columns={[
            {
              header: t('drivers:columns.name'),
              cell: (driver) => <Link to={`/drivers/${driver.userId}`}>{driver.fullName}</Link>,
            },
            { header: t('drivers:columns.phone'), cell: (driver) => driver.phone },
            {
              header: t('drivers:columns.truck'),
              cell: (driver) => label('truck', driver.truckType),
            },
            { header: t('drivers:columns.plate'), cell: (driver) => driver.plateNumber },
            {
              header: t('drivers:columns.status'),
              cell: (driver) => <StatusBadge status={driver.verificationStatus} />,
            },
            {
              header: t('drivers:columns.submitted'),
              cell: (driver) => formatDate(driver.submittedAt),
            },
          ]}
        />
      ) : null}
      {drivers.hasNextPage ? (
        <p>
          <Button
            onClick={() => void drivers.fetchNextPage()}
            disabled={drivers.isFetchingNextPage}
          >
            {t('common:loadMore')}
          </Button>
        </p>
      ) : null}
    </>
  );
}
