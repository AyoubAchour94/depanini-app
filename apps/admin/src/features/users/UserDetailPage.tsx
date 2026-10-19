import { Link, useParams } from 'react-router';

import { ApiError } from '../../api/client';
import { useUser } from '../../api/lookups';
import { formatDate, humanize, StatusBadge } from '../drivers/labels';
import { TripsTable } from '../trips/TripsTable';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const user = useUser(id);

  if (user.isPending) return <p className="muted">Loading…</p>;
  if (user.isError) {
    const notFound = user.error instanceof ApiError && user.error.status === 404;
    return (
      <>
        <p role="alert" className="error">
          {notFound ? 'User not found.' : 'Could not load the user.'}
        </p>
        <Link to="/users">Back to users</Link>
      </>
    );
  }

  const data = user.data;
  const { customerProfile, driverProfile, counts } = data;
  return (
    <>
      <p>
        <Link to="/users">Users</Link>
      </p>
      <h1>{data.customerName ?? data.driverName ?? data.email ?? 'User'}</h1>

      <dl className="details">
        <dt>Email</dt>
        <dd>{data.email ?? '-'}</dd>
        <dt>Phone</dt>
        <dd>{data.phone ?? '-'}</dd>
        <dt>Joined</dt>
        <dd>{formatDate(data.createdAt)}</dd>
      </dl>

      <section aria-label="Profiles">
        <h2>Profiles</h2>
        {!customerProfile && !driverProfile ? <p className="muted">No profile yet.</p> : null}
        {customerProfile ? (
          <section aria-label="Customer profile">
            <h3>Customer</h3>
            <dl className="details">
              <dt>Name</dt>
              <dd>{customerProfile.fullName}</dd>
              <dt>Phone</dt>
              <dd>{customerProfile.phone}</dd>
            </dl>
          </section>
        ) : null}
        {driverProfile ? (
          <section aria-label="Driver profile">
            <h3>Driver</h3>
            <dl className="details">
              <dt>Name</dt>
              <dd>{driverProfile.fullName}</dd>
              <dt>Phone</dt>
              <dd>{driverProfile.phone}</dd>
              <dt>Truck</dt>
              <dd>{humanize(driverProfile.truckType)}</dd>
              <dt>Plate</dt>
              <dd>{driverProfile.plateNumber}</dd>
              <dt>Verification</dt>
              <dd>
                <StatusBadge status={driverProfile.verificationStatus} />{' '}
                <Link to={`/drivers/${data.id}`}>Open the review</Link>
              </dd>
            </dl>
          </section>
        ) : null}
      </section>

      <section aria-label="Counts">
        <h2>Activity</h2>
        <dl className="details">
          <dt>Trips as customer</dt>
          <dd>{counts.tripsAsCustomer}</dd>
          <dt>Trips as driver</dt>
          <dd>{counts.tripsAsDriver}</dd>
          <dt>Reports made</dt>
          <dd>{counts.reportsMade}</dd>
          <dt>Reports against</dt>
          <dd>{counts.reportsAgainst}</dd>
        </dl>
      </section>

      <section aria-label="Recent trips">
        <h2>Recent trips</h2>
        <TripsTable caption="Recent trips" rows={data.recentTrips} />
      </section>
    </>
  );
}
