import { etaMinutes } from '@depanini/shared';

export const FARE_STEP = 1;
export const FARE_LONG_STEP = 5;

/** Keeps `fare` inside the bounds the API allows. */
export const clampFare = (fare: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, fare));

/** Minutes the tow takes for an estimated road distance in metres: the driving time at the average speed. */
export const towMinutes = (distanceM: number): number => etaMinutes(distanceM);
