import { Navigate, Route, Routes } from 'react-router';

import { useAuth } from './auth/AuthProvider';
import { SignInPage } from './auth/SignInPage';
import { DriverDetailPage } from './features/drivers/DriverDetailPage';
import { DriversPage } from './features/drivers/DriversPage';
import { Layout } from './layout/Layout';

/**
 * The routes. Nothing but the sign-in screen renders until the session is an admin's.
 * New screens (#116) add a `<Route>` here and an entry in `layout/nav.ts`.
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
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
