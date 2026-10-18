import type { TruckType } from '@depanini/shared';

import { TRUCK_TYPE_OPTIONS } from '@/features/profile/truck-types';

/** The truck type as the driver chose it in their profile, e.g. "Flatbed". */
export const truckTypeLabel = (type: TruckType) =>
  TRUCK_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
