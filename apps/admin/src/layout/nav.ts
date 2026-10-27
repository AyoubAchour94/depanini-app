/**
 * The sidebar. A new screen adds its entry here and its route in `App.tsx`.
 * `label` is a key of `locales/<lng>/nav.json`.
 */
export interface NavItem {
  to: string;
  label: 'queue' | 'drivers' | 'users' | 'trips' | 'reports' | 'disputes' | 'audit';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/queue', label: 'queue' },
  { to: '/drivers', label: 'drivers' },
  { to: '/users', label: 'users' },
  { to: '/trips', label: 'trips' },
  { to: '/reports', label: 'reports' },
  { to: '/disputes', label: 'disputes' },
  { to: '/audit', label: 'audit' },
];
