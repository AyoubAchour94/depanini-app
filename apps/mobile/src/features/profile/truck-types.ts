import { type DriverProfile, TRUCK_TYPES, type TruckType } from '@depanini/shared';

const LABELS: Record<TruckType, string> = {
  flatbed: 'Flatbed',
  wheel_lift: 'Wheel-lift',
};

/** The truck in one line, e.g. "Flatbed · 123 TU 4567". */
export const describeTruck = ({ truckType, plateNumber }: DriverProfile) =>
  `${LABELS[truckType]} · ${plateNumber}`;

/** The truck types as choices for a form, in `TRUCK_TYPES` order. */
export const TRUCK_TYPE_OPTIONS = TRUCK_TYPES.map((value) => ({ value, label: LABELS[value] }));
