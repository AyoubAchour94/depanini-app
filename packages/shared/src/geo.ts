/** A WGS84 coordinate. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Default map center: Tunis, Tunisia. */
export const TUNIS_CENTER: LatLng = { latitude: 36.8065, longitude: 10.1815 };
