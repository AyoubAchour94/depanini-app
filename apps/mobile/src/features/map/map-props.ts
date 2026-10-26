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
  /** Height (px) of what covers the bottom of the map (the sheet); the fit keeps the markers above it. */
  fitInsetBottom?: number;
  /** Extra px to move the Mapbox logo and attribution down, for a tall banner in the top row (the driver's navigation banner). */
  ornamentOffset?: number;
}

/** Padding (px) around the markers when fitting the camera. */
export const FIT_PADDING = 60;
/** Extra padding (px) at the top of a fit under a sheet: the controls row and the Mapbox logo. */
const FIT_TOP_CONTROLS = 60;
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

/**
 * The padding of a fit: `FIT_PADDING` all around. With `insetBottom` px of the map
 * covered by a sheet, the markers also stay clear of the sheet and, at the top, of
 * the floating controls and the Mapbox logo (`ORNAMENT_TOP` plus the logo).
 */
export function fitPadding(insetBottom = 0) {
  if (insetBottom <= 0) return FIT_PADDING;
  return {
    top: FIT_PADDING + FIT_TOP_CONTROLS,
    right: FIT_PADDING,
    bottom: FIT_PADDING + insetBottom,
    left: FIT_PADDING,
  };
}
