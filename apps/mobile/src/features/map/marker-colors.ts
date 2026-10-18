import type { Theme } from '@/theme/theme';

import type { MapMarkerKind } from './map-props';

/** Pickup in the brand colour, drop-off dark, truck on the warning (amber) colour. */
export function markerColor(kind: MapMarkerKind, theme: Theme): string {
  switch (kind) {
    case 'pickup':
      return theme.brand;
    case 'dropoff':
      return theme.text;
    case 'truck':
      return theme.warning;
  }
}
