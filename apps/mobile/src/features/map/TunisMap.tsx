import { TUNIS_CENTER } from '@depanini/shared';
import Mapbox, { Camera, MapView } from '@rnmapbox/maps';
import { StyleSheet } from 'react-native';

import type { TunisMapProps } from './map-props';

const DEFAULT_ZOOM = 14;

/**
 * Full-screen Mapbox map. It draws no pin of its own: screens put a
 * `CenterPin` over it and read the coordinate under the pin from `onCenterChange`.
 */
export function TunisMap({ accessToken, center = TUNIS_CENTER, onCenterChange }: TunisMapProps) {
  // Idempotent; must run before the native MapView mounts.
  void Mapbox.setAccessToken(accessToken);

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL={Mapbox.StyleURL.Street}
      onMapIdle={(state) => {
        // Mapbox reports [longitude, latitude].
        const [longitude, latitude] = state.properties.center;
        if (longitude !== undefined && latitude !== undefined) {
          onCenterChange?.({ latitude, longitude });
        }
      }}
    >
      <Camera
        centerCoordinate={[center.longitude, center.latitude]}
        zoomLevel={DEFAULT_ZOOM}
        animationMode="none"
      />
    </MapView>
  );
}
