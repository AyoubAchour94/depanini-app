import type { AdminTripItem } from '@depanini/shared';
import { Link } from 'react-router';

import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';
import { dinars, TripStatusBadge } from './labels';

/** Trips as rows (the trip list and a user's recent trips). */
export function TripsTable({ rows, caption }: { rows: AdminTripItem[]; caption: string }) {
  return (
    <Table
      caption={caption}
      rows={rows}
      rowKey={(trip) => trip.id}
      empty="No trips found."
      columns={[
        {
          header: 'Trip',
          cell: (trip) => <Link to={`/trips/${trip.id}`}>{trip.pickupAddress}</Link>,
        },
        { header: 'Customer', cell: (trip) => trip.customerName ?? '-' },
        { header: 'Driver', cell: (trip) => trip.driverName ?? '-' },
        { header: 'Status', cell: (trip) => <TripStatusBadge status={trip.status} /> },
        { header: 'Fare', cell: (trip) => dinars(trip.agreedFare) },
        { header: 'Created', cell: (trip) => formatDate(trip.createdAt) },
      ]}
    />
  );
}
