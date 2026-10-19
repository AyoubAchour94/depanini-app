/**
 * The sidebar. A new screen adds its entry here and its route in `App.tsx`.
 */
export interface NavItem {
  to: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/queue', label: 'Review queue' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/users', label: 'Users' },
  { to: '/trips', label: 'Trips' },
  { to: '/reports', label: 'Reports' },
  { to: '/disputes', label: 'Disputes' },
  { to: '/audit', label: 'Audit log' },
];
