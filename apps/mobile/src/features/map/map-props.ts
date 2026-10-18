import type { LatLng } from '@depanini/shared';

/** The props of `TunisMap` (native) and `TunisMap.web`; keep both implementations on this one interface. */
export interface TunisMapProps {
  accessToken: string;
  /** The coordinate to show at the center of the map. Changing it moves the map there. */
  center?: LatLng;
  /** Called with the center coordinate after the map stops moving (a drag or a recenter). */
  onCenterChange?: (center: LatLng) => void;
}
