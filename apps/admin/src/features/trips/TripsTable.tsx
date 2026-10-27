import type { AdminTripItem } from '@depanini/shared';
import { Link } from 'react-router';

import { useTranslation } from '../../i18n';
import { formatMoney } from '../../i18n/format';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';
import { TripStatusBadge } from './labels';

/** Trips as rows (the trip list and a user's recent trips). */
export function TripsTable({ rows, caption }: { rows: AdminTripItem[]; caption: string }) {
  const { t } = useTranslation();
  return (
    <Table
      caption={caption}
      rows={rows}
      rowKey={(trip) => trip.id}
      empty={t('trips:empty')}
      columns={[
        {
          header: t('trips:columns.trip'),
          cell: (trip) => <Link to={`/trips/${trip.id}`}>{trip.pickupAddress}</Link>,
        },
        { header: t('trips:columns.customer'), cell: (trip) => trip.customerName ?? '-' },
        { header: t('trips:columns.driver'), cell: (trip) => trip.driverName ?? '-' },
        {
          header: t('trips:columns.status'),
          cell: (trip) => <TripStatusBadge status={trip.status} />,
        },
        { header: t('trips:columns.fare'), cell: (trip) => formatMoney(trip.agreedFare) },
        { header: t('trips:columns.created'), cell: (trip) => formatDate(trip.createdAt) },
      ]}
    />
  );
}
