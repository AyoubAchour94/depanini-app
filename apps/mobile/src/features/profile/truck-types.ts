import { TRUCK_TYPES, type TruckType } from '@depanini/shared';

const LABELS: Record<TruckType, string> = {
  flatbed: 'Flatbed',
  wheel_lift: 'Wheel-lift',
};

export const truckTypeLabel = (type: TruckType) => LABELS[type];

/** The truck types as choices for a form, in `TRUCK_TYPES` order. */
export const TRUCK_TYPE_OPTIONS = TRUCK_TYPES.map((value) => ({ value, label: LABELS[value] }));
