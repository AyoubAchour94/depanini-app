import type { Theme } from '@/theme/theme';

import type { MapMarkerKind } from './map-props';

export interface MarkerColors {
  /** Fill of the marker. */
  fill: string;
  /** The ring around it, which separates it from the map. */
  ring: string;
  /** Glyph (the truck) drawn on the fill. */
  glyph: string;
}

/** Pickup in the app colour, drop-off in ink, truck in ink (light) or the app colour (dark); all from `t.color.map`. */
export function markerColors(kind: MapMarkerKind, theme: Theme): MarkerColors {
  const m = theme.color.map;
  const fill = { pickup: m.pickup, dropoff: m.dropoff, truck: m.truck }[kind];
  return { fill, ring: m.truckRing, glyph: m.onTruck };
}
