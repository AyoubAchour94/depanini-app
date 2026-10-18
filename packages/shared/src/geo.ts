/** A WGS84 coordinate. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Default map center: Tunis, Tunisia. */
export const TUNIS_CENTER: LatLng = { latitude: 36.8065, longitude: 10.1815 };

/** Tunisia's bounding box. Places outside it are rejected. */
export const TUNISIA_BOUNDS = {
  minLatitude: 30.2,
  maxLatitude: 37.6,
  minLongitude: 7.5,
  maxLongitude: 11.7,
} as const;

/** Whether a coordinate lies inside {@link TUNISIA_BOUNDS}. */
export function isInTunisia({ latitude, longitude }: LatLng): boolean {
  return (
    latitude >= TUNISIA_BOUNDS.minLatitude &&
    latitude <= TUNISIA_BOUNDS.maxLatitude &&
    longitude >= TUNISIA_BOUNDS.minLongitude &&
    longitude <= TUNISIA_BOUNDS.maxLongitude
  );
}
