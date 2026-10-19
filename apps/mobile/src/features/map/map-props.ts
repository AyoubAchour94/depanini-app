import type { LatLng } from '@depanini/shared';

export type MapMarkerKind = 'pickup' | 'dropoff' | 'truck';

/** A point drawn on the map. Keep `id` stable: a changed `coordinate` moves the marker with that id. */
export interface MapMarker {
  id: string;
  kind: MapMarkerKind;
  coordinate: LatLng;
}

/** The props of `TunisMap` (native) and `TunisMap.web`; keep both implementations on this one interface. */
export interface TunisMapProps {
  accessToken: string;
  /** The coordinate to show at the center of the map. Changing it moves the map there. */
  center?: LatLng;
  /** Called with the center coordinate after the map stops moving (a drag or a recenter). */
  onCenterChange?: (center: LatLng) => void;
  /**
   * Fixed points to draw (pickup, drop-off, truck). Unset or empty keeps the
   * center-pin mode. With markers, callers should not render `CenterPin`.
   */
  markers?: MapMarker[];
  /** Fit the camera to all markers when the set of marker ids changes (not on every coordinate update). */
  fitToMarkers?: boolean;
}

/** Padding (px) around the markers when fitting the camera. */
export const FIT_PADDING = 60;
/** Closest zoom the fit may reach, so a single marker doesn't zoom to rooftops. */
export const FIT_MAX_ZOOM = 15;

/** Changes only when markers are added or removed, not when one moves. */
export function markerIdsKey(markers: MapMarker[] | undefined): string {
  return (markers ?? [])
    .map((m) => m.id)
    .sort()
    .join('|');
}

/**
 * Distance (px) from the top of the map to its Mapbox logo and attribution.
 * They sit at the end of the screen under the floating controls, not at the bottom where the sheet is.
 */
export const ORNAMENT_TOP = 72;
