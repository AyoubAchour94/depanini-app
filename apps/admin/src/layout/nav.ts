/**
 * The sidebar. A new screen adds its entry here and its route in `App.tsx`
 * (users, trips, reports, disputes and audit follow in #116).
 */
export interface NavItem {
  to: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/queue', label: 'Review queue' },
  { to: '/drivers', label: 'Drivers' },
];
