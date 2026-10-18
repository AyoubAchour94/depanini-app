export const FARE_STEP = 1;
export const FARE_LONG_STEP = 5;

/** Keeps `fare` inside the bounds the API allows. */
export const clampFare = (fare: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, fare));
