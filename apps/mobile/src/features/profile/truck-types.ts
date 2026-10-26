import { type DriverProfile, TRUCK_TYPES, type TruckType } from '@depanini/shared';

import { translate } from '@/i18n';

/** The truck type as text in the active language, e.g. "Wheel-lift". */
export const truckTypeLabel = (type: TruckType) => translate(`common:truckTypes.${type}`);

/** The truck in one line, e.g. "Flatbed · 123 TU 4567". */
export const describeTruck = ({ truckType, plateNumber }: DriverProfile) =>
  translate('common:truckLine', { truck: truckTypeLabel(truckType), plate: plateNumber });

/** The truck types as choices for a form, in `TRUCK_TYPES` order. */
export const truckTypeOptions = () =>
  TRUCK_TYPES.map((value) => ({ value, label: truckTypeLabel(value) }));
