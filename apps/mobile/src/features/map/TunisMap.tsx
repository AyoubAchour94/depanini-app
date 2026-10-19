import { TUNIS_CENTER } from '@depanini/shared';
import Mapbox, { Camera, MapView, MarkerView } from '@rnmapbox/maps';
import { useContext, useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';

import { mapStyleUrl } from './map-style';
import { markerColors } from './marker-colors';
import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  markerIdsKey,
  ORNAMENT_TOP,
  type TunisMapProps,
} from './map-props';

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
  const ornamentTop = (useContext(SafeAreaInsetsContext)?.top ?? 0) + ORNAMENT_TOP;
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
      styleURL={mapStyleUrl(theme.scheme)}
      // The sheet covers the bottom of the map, so the ornaments move to the top.
      logoPosition={{ top: ornamentTop, right: 8 }}
      attributionPosition={{ top: ornamentTop, right: 104 }}
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
      {(markers ?? []).map(({ id, kind, coordinate }) => {
        const colors = markerColors(kind, theme);
        return (
          <MarkerView key={id} coordinate={[coordinate.longitude, coordinate.latitude]}>
            <View
              testID={`marker-${id}`}
              style={[
                styles.marker,
                kind === 'truck' && styles.truck,
                {
                  backgroundColor: colors.fill,
                  borderColor: colors.ring,
                  boxShadow: theme.shadow.float,
                },
              ]}
            >
              {kind === 'truck' ? <Text style={{ color: colors.glyph }}>🚚</Text> : null}
            </View>
          </MarkerView>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  truck: { width: 34, height: 34, borderRadius: 17 },
});
