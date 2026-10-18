import type { LatLng } from './geo';
import type { VehicleType } from './tow-request';

/**
 * Multiplier from the straight-line distance to an estimated road distance.
 * Avoids routing API costs.
 */
export const ROAD_FACTOR = 1.3;

/** Fare per vehicle type: a base in TND plus a rate per road kilometre. */
export const FARE_RATES: Record<VehicleType, { baseTnd: number; perKmTnd: number }> = {
  car: { baseTnd: 40, perKmTnd: 2 },
  suv_van: { baseTnd: 50, perKmTnd: 2.5 },
  motorcycle: { baseTnd: 30, perKmTnd: 1.5 },
};

/** The lowest proposed fare, as a share of the suggested fare. */
export const MIN_FARE_RATIO = 0.8;

/** The highest proposed fare, as a multiple of the suggested fare. */
export const MAX_FARE_RATIO = 3;

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Straight-line distance between two coordinates, in metres. The API measures
 * the real distance with PostGIS; this is for app-side previews and as a test
 * reference.
 */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated road distance in whole metres: the straight line times {@link ROAD_FACTOR}. */
export function estimateRoadDistanceM(a: LatLng, b: LatLng): number {
  return Math.round(haversineM(a, b) * ROAD_FACTOR);
}

/** The suggested fare in whole dinars for an estimated road distance in metres. */
export function suggestFare(distanceM: number, vehicleType: VehicleType): number {
  const { baseTnd, perKmTnd } = FARE_RATES[vehicleType];
  return Math.round(baseTnd + (perKmTnd * distanceM) / 1000);
}

/** The lowest and highest fare a customer may propose for a suggested fare. */
export function fareBounds(suggested: number): { min: number; max: number } {
  return {
    min: Math.ceil(suggested * MIN_FARE_RATIO),
    max: suggested * MAX_FARE_RATIO,
  };
}

/** Whether a proposed fare is a whole number of dinars within the bounds. */
export function isFareAllowed(fare: number, suggested: number): boolean {
  const { min, max } = fareBounds(suggested);
  return Number.isInteger(fare) && fare >= min && fare <= max;
}
