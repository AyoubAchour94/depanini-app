import type { AdminRating } from '@depanini/shared';
import { Link, useParams } from 'react-router';

import { ApiError } from '../../api/client';
import { useTrip } from '../../api/lookups';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { formatKilometres, formatMoney, formatNumber } from '../../i18n/format';
import { Badge } from '../../ui/Badge';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';
import { ReportStatusBadge, useResolvedBy } from '../queues/labels';
import { TripStatusBadge } from './labels';

function Rating({ title, rating }: { title: string; rating: AdminRating | null | undefined }) {
  const { t } = useTranslation();
  const label = useEnumLabel();
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {rating ? (
        <dl className="details">
          <dt>{t('trips:detail.stars')}</dt>
          <dd>{t('common:outOfFive', { stars: formatNumber(rating.stars) })}</dd>
          {rating.tags.length > 0 ? (
            <>
              <dt>{t('trips:detail.tags')}</dt>
              <dd>{rating.tags.map((tag) => label('ratingTag', tag)).join(', ')}</dd>
            </>
          ) : null}
          <dt>{t('trips:detail.comment')}</dt>
          <dd>{rating.comment || '-'}</dd>
        </dl>
      ) : (
        <p className="muted">{t('trips:detail.notRated')}</p>
      )}
    </section>
  );
}

export function TripDetailPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const resolvedBy = useResolvedBy();
  const { id = '' } = useParams();
  const trip = useTrip(id);

  if (trip.isPending) return <p className="muted">{t('common:loading')}</p>;
  if (trip.isError) {
    const notFound = trip.error instanceof ApiError && trip.error.status === 404;
    return (
      <>
        <p role="alert" className="error">
          {notFound ? t('trips:detail.notFound') : t('trips:detail.loadFailed')}
        </p>
        <Link to="/trips">{t('trips:detail.back')}</Link>
      </>
    );
  }

  const data = trip.data;
  const { payment } = data;
  const timeline: [string, string | null | undefined][] = [
    [t('trips:detail.requested'), data.createdAt],
    [t('trips:detail.accepted'), data.assignedAt],
    [t('trips:detail.enRoute'), data.enRouteAt],
    [t('trips:detail.arrived'), data.arrivedAt],
    [t('trips:detail.towing'), data.towingAt],
    [t('trips:detail.completed'), data.completedAt],
    [t('trips:detail.cancelled'), data.cancelledAt],
  ];

  return (
    <>
      <p>
        <Link to="/trips">{t('trips:title')}</Link>
      </p>
      <div className="row">
        <h1>{t('trips:detail.route', { from: data.pickupAddress, to: data.dropoffAddress })}</h1>
        <TripStatusBadge status={data.status} />
      </div>

      <section aria-label={t('trips:detail.summary')}>
        <dl className="details">
          <dt>{t('trips:detail.tripId')}</dt>
          <dd>{data.id}</dd>
          <dt>{t('trips:detail.customer')}</dt>
          <dd>
            {data.customer ? (
              <Link to={`/users/${data.customer.userId}`}>{data.customer.fullName}</Link>
            ) : (
              '-'
            )}
            {data.customer?.phone ? ` (${data.customer.phone})` : ''}
          </dd>
          <dt>{t('trips:detail.driver')}</dt>
          <dd>
            {data.driver ? (
              <Link to={`/users/${data.driver.userId}`}>{data.driver.fullName}</Link>
            ) : (
              '-'
            )}
            {data.driver?.phone ? ` (${data.driver.phone})` : ''}
            {data.driver?.plateNumber ? `, ${data.driver.plateNumber}` : ''}
          </dd>
          <dt>{t('trips:detail.problem')}</dt>
          <dd>
            {t('trips:detail.problemLine', {
              problem: label('problem', data.problemType),
              vehicle: label('vehicle', data.vehicleType),
            })}
          </dd>
          {data.note ? (
            <>
              <dt>{t('trips:detail.customerNote')}</dt>
              <dd>{data.note}</dd>
            </>
          ) : null}
          <dt>{t('trips:detail.distance')}</dt>
          <dd>{formatKilometres(data.distanceM)}</dd>
          <dt>{t('trips:detail.fare')}</dt>
          <dd>
            {t('trips:detail.fareLine', {
              agreed: formatMoney(data.agreedFare),
              suggested: formatMoney(data.suggestedFare),
              proposed: formatMoney(data.proposedFare),
            })}
          </dd>
          {data.cancelledBy ? (
            <>
              <dt>{t('trips:detail.cancelledBy')}</dt>
              <dd>
                {data.cancelReason
                  ? t('trips:detail.cancelledByLine', {
                      who: label('party', data.cancelledBy),
                      reason: data.cancelReason,
                    })
                  : label('party', data.cancelledBy)}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section aria-label={t('trips:detail.timeline')}>
        <h2>{t('trips:detail.timeline')}</h2>
        <dl className="details">
          {timeline
            .filter(([, at]) => at)
            .map(([name, at]) => (
              <div key={name} style={{ display: 'contents' }}>
                <dt>{name}</dt>
                <dd>{formatDate(at)}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section aria-label={t('trips:detail.offers')}>
        <h2>{t('trips:detail.offers')}</h2>
        <Table
          caption={t('trips:detail.offers')}
          rows={data.offers}
          rowKey={(offer) => offer.id}
          empty={t('trips:detail.noOffers')}
          columns={[
            { header: t('trips:columns.offeredBy'), cell: (offer) => offer.driverName },
            { header: t('trips:columns.offerFare'), cell: (offer) => formatMoney(offer.fare) },
            {
              header: t('trips:columns.offerStatus'),
              cell: (offer) => label('offerStatus', offer.status),
            },
            { header: t('trips:columns.offered'), cell: (offer) => formatDate(offer.createdAt) },
          ]}
        />
      </section>

      <section aria-label={t('trips:detail.payment')}>
        <h2>{t('trips:detail.payment')}</h2>
        {payment ? (
          <dl className="details">
            <dt>{t('trips:detail.paymentStatus')}</dt>
            <dd>
              <Badge tone={payment.status === 'disputed' ? 'danger' : 'success'}>
                {label('paymentStatus', payment.status)}
              </Badge>
            </dd>
            <dt>{t('trips:detail.receipt')}</dt>
            <dd>{payment.receiptNo}</dd>
            <dt>{t('trips:detail.amount')}</dt>
            <dd>
              {t('trips:detail.amountLine', {
                amount: formatMoney(payment.amountTnd),
                method: label('paymentMethod', payment.method),
              })}
            </dd>
            <dt>{t('trips:detail.driverConfirmed')}</dt>
            <dd>{formatDate(payment.driverConfirmedAt)}</dd>
            {payment.customerAnsweredAt ? (
              <>
                <dt>{t('trips:detail.customerAnswered')}</dt>
                <dd>{formatDate(payment.customerAnsweredAt)}</dd>
              </>
            ) : null}
            {payment.disputeNote ? (
              <>
                <dt>{t('trips:detail.disputeNote')}</dt>
                <dd>{payment.disputeNote}</dd>
              </>
            ) : null}
            {payment.resolutionNote ? (
              <>
                <dt>{t('trips:detail.resolution')}</dt>
                <dd>
                  {payment.resolutionNote}
                  <div className="muted">
                    {t('trips:detail.resolvedOn', { date: formatDate(payment.resolvedAt) })}
                  </div>
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="muted">{t('trips:detail.noPayment')}</p>
        )}
      </section>

      <section aria-label={t('trips:detail.ratings')}>
        <h2>{t('trips:detail.ratings')}</h2>
        <Rating title={t('trips:detail.customerRatedDriver')} rating={data.customerRating} />
        <Rating title={t('trips:detail.driverRatedCustomer')} rating={data.driverRating} />
      </section>

      <section aria-label={t('trips:detail.reports')}>
        <h2>{t('trips:detail.reports')}</h2>
        <Table
          caption={t('trips:detail.reportsCaption')}
          rows={data.reports}
          rowKey={(report) => report.id}
          empty={t('trips:detail.noReports')}
          columns={[
            {
              header: t('trips:columns.category'),
              cell: (report) => label('reportCategory', report.category),
            },
            {
              header: t('trips:columns.reporter'),
              cell: (report) =>
                t('queues:reporter', {
                  name: report.reporterName ?? t('queues:unknownReporter'),
                  role: label('party', report.reporterRole).toLowerCase(),
                }),
            },
            { header: t('trips:columns.note'), cell: (report) => report.note },
            {
              header: t('queues:columns.status'),
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
