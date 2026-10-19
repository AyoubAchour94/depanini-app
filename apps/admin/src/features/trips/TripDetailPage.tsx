import type { AdminRating } from '@depanini/shared';
import { Link, useParams } from 'react-router';

import { ApiError } from '../../api/client';
import { useTrip } from '../../api/lookups';
import { Badge } from '../../ui/Badge';
import { Table } from '../../ui/Table';
import { formatDate, humanize } from '../drivers/labels';
import { CATEGORY_LABEL, ReportStatusBadge, resolvedBy } from '../queues/labels';
import { dinars, TripStatusBadge } from './labels';

function Rating({ title, rating }: { title: string; rating: AdminRating | null | undefined }) {
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {rating ? (
        <dl className="details">
          <dt>Stars</dt>
          <dd>{rating.stars} / 5</dd>
          {rating.tags.length > 0 ? (
            <>
              <dt>Tags</dt>
              <dd>{rating.tags.map(humanize).join(', ')}</dd>
            </>
          ) : null}
          <dt>Comment</dt>
          <dd>{rating.comment || '-'}</dd>
        </dl>
      ) : (
        <p className="muted">Not rated.</p>
      )}
    </section>
  );
}

export function TripDetailPage() {
  const { id = '' } = useParams();
  const trip = useTrip(id);

  if (trip.isPending) return <p className="muted">Loading…</p>;
  if (trip.isError) {
    const notFound = trip.error instanceof ApiError && trip.error.status === 404;
    return (
      <>
        <p role="alert" className="error">
          {notFound ? 'Trip not found.' : 'Could not load the trip.'}
        </p>
        <Link to="/trips">Back to trips</Link>
      </>
    );
  }

  const data = trip.data;
  const { payment } = data;
  const timeline: [string, string | null | undefined][] = [
    ['Requested', data.createdAt],
    ['Accepted', data.assignedAt],
    ['On the way', data.enRouteAt],
    ['Arrived', data.arrivedAt],
    ['Towing', data.towingAt],
    ['Completed', data.completedAt],
    ['Cancelled', data.cancelledAt],
  ];

  return (
    <>
      <p>
        <Link to="/trips">Trips</Link>
      </p>
      <div className="row">
        <h1>
          {data.pickupAddress} to {data.dropoffAddress}
        </h1>
        <TripStatusBadge status={data.status} />
      </div>

      <section aria-label="Summary">
        <dl className="details">
          <dt>Trip id</dt>
          <dd>{data.id}</dd>
          <dt>Customer</dt>
          <dd>
            {data.customer ? (
              <Link to={`/users/${data.customer.userId}`}>{data.customer.fullName}</Link>
            ) : (
              '-'
            )}
            {data.customer?.phone ? ` (${data.customer.phone})` : ''}
          </dd>
          <dt>Driver</dt>
          <dd>
            {data.driver ? (
              <Link to={`/users/${data.driver.userId}`}>{data.driver.fullName}</Link>
            ) : (
              '-'
            )}
            {data.driver?.phone ? ` (${data.driver.phone})` : ''}
            {data.driver?.plateNumber ? `, ${data.driver.plateNumber}` : ''}
          </dd>
          <dt>Problem</dt>
          <dd>
            {humanize(data.problemType)}, {humanize(data.vehicleType)}
          </dd>
          {data.note ? (
            <>
              <dt>Customer note</dt>
              <dd>{data.note}</dd>
            </>
          ) : null}
          <dt>Distance</dt>
          <dd>{(data.distanceM / 1000).toFixed(1)} km</dd>
          <dt>Fare</dt>
          <dd>
            {dinars(data.agreedFare)} agreed (suggested {dinars(data.suggestedFare)}, proposed{' '}
            {dinars(data.proposedFare)})
          </dd>
          {data.cancelledBy ? (
            <>
              <dt>Cancelled by</dt>
              <dd>
                {humanize(data.cancelledBy)}
                {data.cancelReason ? `: ${data.cancelReason}` : ''}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section aria-label="Timeline">
        <h2>Timeline</h2>
        <dl className="details">
          {timeline
            .filter(([, at]) => at)
            .map(([label, at]) => (
              <div key={label} style={{ display: 'contents' }}>
                <dt>{label}</dt>
                <dd>{formatDate(at)}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section aria-label="Offers">
        <h2>Offers</h2>
        <Table
          caption="Offers"
          rows={data.offers}
          rowKey={(offer) => offer.id}
          empty="No offers."
          columns={[
            { header: 'Driver', cell: (offer) => offer.driverName },
            { header: 'Fare', cell: (offer) => dinars(offer.fare) },
            { header: 'Status', cell: (offer) => humanize(offer.status) },
            { header: 'Offered', cell: (offer) => formatDate(offer.createdAt) },
          ]}
        />
      </section>

      <section aria-label="Payment">
        <h2>Payment</h2>
        {payment ? (
          <dl className="details">
            <dt>Status</dt>
            <dd>
              <Badge tone={payment.status === 'disputed' ? 'danger' : 'success'}>
                {humanize(payment.status)}
              </Badge>
            </dd>
            <dt>Receipt</dt>
            <dd>{payment.receiptNo}</dd>
            <dt>Amount</dt>
            <dd>
              {dinars(payment.amountTnd)} ({payment.method})
            </dd>
            <dt>Driver confirmed</dt>
            <dd>{formatDate(payment.driverConfirmedAt)}</dd>
            {payment.customerAnsweredAt ? (
              <>
                <dt>Customer answered</dt>
                <dd>{formatDate(payment.customerAnsweredAt)}</dd>
              </>
            ) : null}
            {payment.disputeNote ? (
              <>
                <dt>Dispute note</dt>
                <dd>{payment.disputeNote}</dd>
              </>
            ) : null}
            {payment.resolutionNote ? (
              <>
                <dt>Resolution</dt>
                <dd>
                  {payment.resolutionNote}
                  <div className="muted">Resolved on {formatDate(payment.resolvedAt)}</div>
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="muted">No payment yet.</p>
        )}
      </section>

      <section aria-label="Ratings">
        <h2>Ratings</h2>
        <Rating title="Customer rated the driver" rating={data.customerRating} />
        <Rating title="Driver rated the customer" rating={data.driverRating} />
      </section>

      <section aria-label="Reports">
        <h2>Reports</h2>
        <Table
          caption="Reports on this trip"
          rows={data.reports}
          rowKey={(report) => report.id}
          empty="No reports."
          columns={[
            { header: 'Category', cell: (report) => CATEGORY_LABEL[report.category] },
            {
              header: 'Reporter',
              cell: (report) => `${report.reporterName ?? 'Unknown'} (${report.reporterRole})`,
            },
            { header: 'Note', cell: (report) => report.note },
            {
              header: 'Status',
              cell: (report) => (
                <>
                  <ReportStatusBadge status={report.status} />
                  {report.status === 'resolved' ? (
                    <>
                      <div className="muted">
                        {resolvedBy(report.resolvedByEmail, report.resolvedAt)}
                      </div>
                      <div>{report.resolutionNote}</div>
                    </>
                  ) : null}
                </>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
