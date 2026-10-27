import { Link, useParams } from 'react-router';

import { ApiError } from '../../api/client';
import { useUser } from '../../api/lookups';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { formatNumber } from '../../i18n/format';
import { formatDate, StatusBadge } from '../drivers/labels';
import { TripsTable } from '../trips/TripsTable';

export function UserDetailPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const { id = '' } = useParams();
  const user = useUser(id);

  if (user.isPending) return <p className="muted">{t('common:loading')}</p>;
  if (user.isError) {
    const notFound = user.error instanceof ApiError && user.error.status === 404;
    return (
      <>
        <p role="alert" className="error">
          {notFound ? t('users:detail.notFound') : t('users:detail.loadFailed')}
        </p>
        <Link to="/users">{t('users:detail.back')}</Link>
      </>
    );
  }

  const data = user.data;
  const { customerProfile, driverProfile, counts } = data;
  return (
    <>
      <p>
        <Link to="/users">{t('users:title')}</Link>
      </p>
      <h1>
        {data.customerName ?? data.driverName ?? data.email ?? t('users:detail.fallbackTitle')}
      </h1>

      <dl className="details">
        <dt>{t('users:detail.email')}</dt>
        <dd>{data.email ?? '-'}</dd>
        <dt>{t('users:detail.phone')}</dt>
        <dd>{data.phone ?? '-'}</dd>
        <dt>{t('users:detail.joined')}</dt>
        <dd>{formatDate(data.createdAt)}</dd>
      </dl>

      <section aria-label={t('users:detail.profiles')}>
        <h2>{t('users:detail.profiles')}</h2>
        {!customerProfile && !driverProfile ? (
          <p className="muted">{t('users:detail.noProfile')}</p>
        ) : null}
        {customerProfile ? (
          <section aria-label={t('users:detail.customerProfile')}>
            <h3>{label('party', 'customer')}</h3>
            <dl className="details">
              <dt>{t('users:detail.name')}</dt>
              <dd>{customerProfile.fullName}</dd>
              <dt>{t('users:detail.phone')}</dt>
              <dd>{customerProfile.phone}</dd>
            </dl>
          </section>
        ) : null}
        {driverProfile ? (
          <section aria-label={t('users:detail.driverProfile')}>
            <h3>{label('party', 'driver')}</h3>
            <dl className="details">
              <dt>{t('users:detail.name')}</dt>
              <dd>{driverProfile.fullName}</dd>
              <dt>{t('users:detail.phone')}</dt>
              <dd>{driverProfile.phone}</dd>
              <dt>{t('users:detail.truck')}</dt>
              <dd>{label('truck', driverProfile.truckType)}</dd>
              <dt>{t('users:detail.plate')}</dt>
              <dd>{driverProfile.plateNumber}</dd>
              <dt>{t('users:detail.verification')}</dt>
              <dd>
                <StatusBadge status={driverProfile.verificationStatus} />{' '}
                <Link to={`/drivers/${data.id}`}>{t('users:detail.openReview')}</Link>
              </dd>
            </dl>
          </section>
        ) : null}
      </section>

      <section aria-label={t('users:detail.counts')}>
        <h2>{t('users:detail.activity')}</h2>
        <dl className="details">
          <dt>{t('users:detail.tripsAsCustomer')}</dt>
          <dd>{formatNumber(counts.tripsAsCustomer)}</dd>
          <dt>{t('users:detail.tripsAsDriver')}</dt>
          <dd>{formatNumber(counts.tripsAsDriver)}</dd>
          <dt>{t('users:detail.reportsMade')}</dt>
          <dd>{formatNumber(counts.reportsMade)}</dd>
          <dt>{t('users:detail.reportsAgainst')}</dt>
          <dd>{formatNumber(counts.reportsAgainst)}</dd>
        </dl>
      </section>

      <section aria-label={t('users:detail.recentTrips')}>
        <h2>{t('users:detail.recentTrips')}</h2>
        <TripsTable caption={t('users:detail.recentTrips')} rows={data.recentTrips} />
      </section>
    </>
  );
}
