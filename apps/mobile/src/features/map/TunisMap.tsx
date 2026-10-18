import { TUNIS_CENTER } from '@depanini/shared';
import Mapbox, { Camera, MapView, MarkerView } from '@rnmapbox/maps';
import { useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { markerColor } from './marker-colors';
import { FIT_MAX_ZOOM, FIT_PADDING, markerIdsKey, type TunisMapProps } from './map-props';

const DEFAULT_ZOOM = 14;

/**
 * Full-screen Mapbox map. It draws no center pin of its own: screens put a
 * `CenterPin` over it and read the coordinate under the pin from `onCenterChange`.
 * With `markers`, it draws those instead (callers then skip `CenterPin`).
 */
export function TunisMap({
  accessToken,
  center = TUNIS_CENTER,
  onCenterChange,
  markers,
  fitToMarkers,
}: TunisMapProps) {
  const theme = useTheme();
  const camera = useRef<ComponentRef<typeof Camera>>(null);
  // Idempotent; must run before the native MapView mounts.
  void Mapbox.setAccessToken(accessToken);

  // Fit only when ids are added or removed; read the coordinates through a ref.
  const latestMarkers = useRef(markers);
  useEffect(() => {
    latestMarkers.current = markers;
  });
  const idsKey = markerIdsKey(markers);
  useEffect(() => {
    const points = latestMarkers.current ?? [];
    if (!fitToMarkers || points.length === 0) return;
    const lngs = points.map((m) => m.coordinate.longitude);
    const lats = points.map((m) => m.coordinate.latitude);
    if (points.length === 1) {
      camera.current?.setCamera({
        centerCoordinate: [lngs[0]!, lats[0]!],
        zoomLevel: FIT_MAX_ZOOM,
        animationDuration: 0,
      });
      return;
    }
    camera.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      FIT_PADDING,
      0,
    );
  }, [idsKey, fitToMarkers]);

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
        ref={camera}
        centerCoordinate={[center.longitude, center.latitude]}
        zoomLevel={DEFAULT_ZOOM}
        animationMode="none"
      />
      {(markers ?? []).map(({ id, kind, coordinate }) => (
        <MarkerView key={id} coordinate={[coordinate.longitude, coordinate.latitude]}>
          <View
            testID={`marker-${id}`}
            style={[
              styles.marker,
              kind === 'truck' && styles.truck,
              { backgroundColor: markerColor(kind, theme) },
            ]}
          >
            {kind === 'truck' ? <Text>🚚</Text> : null}
          </View>
        </MarkerView>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  truck: { width: 34, height: 34, borderRadius: 17 },
});
