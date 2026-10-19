import { NavLink, Outlet } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import { useEndSessionOnRefusal } from '../auth/useEndSessionOnRefusal';
import { Button } from '../ui/Button';
import { NAV_ITEMS } from './nav';

/** Sidebar plus the page. */
export function Layout() {
  const { state, signOut } = useAuth();
  useEndSessionOnRefusal();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">Depanini Admin</div>
        <nav className="sidebar__nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className="sidebar__link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        {state.status === 'admin' ? <div className="sidebar__user">{state.email}</div> : null}
        <Button onClick={() => void signOut()}>Sign out</Button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
