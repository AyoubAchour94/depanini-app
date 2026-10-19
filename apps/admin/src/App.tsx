import { Navigate, Route, Routes } from 'react-router';

import { useAuth } from './auth/AuthProvider';
import { SignInPage } from './auth/SignInPage';
import { DriverDetailPage } from './features/drivers/DriverDetailPage';
import { DriversPage } from './features/drivers/DriversPage';
import { AuditPage } from './features/audit/AuditPage';
import { DisputesPage } from './features/queues/DisputesPage';
import { ReportsPage } from './features/queues/ReportsPage';
import { TripDetailPage } from './features/trips/TripDetailPage';
import { TripsPage } from './features/trips/TripsPage';
import { UserDetailPage } from './features/users/UserDetailPage';
import { UsersPage } from './features/users/UsersPage';
import { Layout } from './layout/Layout';

/**
 * The routes. Nothing but the sign-in screen renders until the session is an admin's.
 * A new screen adds a `<Route>` here and an entry in `layout/nav.ts`.
 */
export function App() {
  const { state } = useAuth();
  if (state.status === 'loading') return <p className="muted centered">Loading…</p>;
  if (state.status === 'signedOut') return <SignInPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/queue" replace />} />
        <Route path="queue" element={<DriversPage mode="queue" />} />
        <Route path="drivers" element={<DriversPage mode="all" />} />
        <Route path="drivers/:userId" element={<DriverDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="trips/:id" element={<TripDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="disputes" element={<DisputesPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
