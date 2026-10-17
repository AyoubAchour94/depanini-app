import { TUNIS_CENTER } from '@depanini/shared';
import Mapbox, { Camera, MapView, MarkerView } from '@rnmapbox/maps';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

const DEFAULT_ZOOM = 12;
/** Mapbox expects [longitude, latitude]. */
const TUNIS: [number, number] = [TUNIS_CENTER.longitude, TUNIS_CENTER.latitude];

/** Full-screen Mapbox map centered on Tunis with a pin on the city center. */
export function TunisMap({ accessToken }: { accessToken: string }) {
  const theme = useTheme();
  // Idempotent; must run before the native MapView mounts.
  void Mapbox.setAccessToken(accessToken);

  return (
    <MapView style={StyleSheet.absoluteFill} styleURL={Mapbox.StyleURL.Street}>
      <Camera centerCoordinate={TUNIS} zoomLevel={DEFAULT_ZOOM} animationMode="none" />
      <MarkerView coordinate={TUNIS}>
        <View style={[styles.pin, { backgroundColor: theme.brand, borderColor: theme.onBrand }]} />
      </MarkerView>
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
});
