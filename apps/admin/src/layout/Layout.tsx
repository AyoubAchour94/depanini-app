import { NavLink, Outlet } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import { useEndSessionOnRefusal } from '../auth/useEndSessionOnRefusal';
import { useTranslation } from '../i18n';
import { Button } from '../ui/Button';
import { LanguageSwitch } from './LanguageSwitch';
import { LEGAL_URLS } from './legal';
import { NAV_ITEMS } from './nav';

/** Sidebar plus the page. */
export function Layout() {
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  useEndSessionOnRefusal();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">{t('common:brand')}</div>
        <nav className="sidebar__nav" aria-label={t('nav:main')}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className="sidebar__link">
              {t(`nav:${item.label}`)}
            </NavLink>
          ))}
        </nav>
        <LanguageSwitch />
        {state.status === 'admin' ? <div className="sidebar__user">{state.email}</div> : null}
        <Button onClick={() => void signOut()}>{t('nav:signOut')}</Button>
        <footer className="sidebar__legal">
          <a href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">
            {t('nav:terms')}
          </a>
          <a href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">
            {t('nav:privacy')}
          </a>
        </footer>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
