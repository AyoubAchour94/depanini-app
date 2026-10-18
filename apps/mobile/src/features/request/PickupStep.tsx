import { isInTunisia, type LatLng, type Place, TUNIS_CENTER } from '@depanini/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { CenterPin } from '@/features/map/CenterPin';
import { MissingTokenView } from '@/features/map/MapScreen';
import { TunisMap } from '@/features/map/TunisMap';
import { useReverseGeocode } from '@/features/places/hooks';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { requestStrings as t } from './strings';

type StartPosition =
  { status: 'locating' } | { status: 'ready'; center: LatLng; fallback?: 'denied' | 'unavailable' };

/**
 * Asks for foreground location (this is the moment the customer starts a
 * request, so the prompt makes sense) and falls back to Tunis when it is
 * denied or the position can't be read.
 */
function useStartPosition(): StartPosition {
  const [position, setPosition] = useState<StartPosition>({ status: 'locating' });

  useEffect(() => {
    let cancelled = false;
    const finish = (next: StartPosition) => {
      if (!cancelled) setPosition(next);
    };
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          return finish({ status: 'ready', center: TUNIS_CENTER, fallback: 'denied' });
        }
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const center = { latitude: coords.latitude, longitude: coords.longitude };
        finish(
          isInTunisia(center)
            ? { status: 'ready', center }
            : { status: 'ready', center: TUNIS_CENTER, fallback: 'unavailable' },
        );
      } catch {
        finish({ status: 'ready', center: TUNIS_CENTER, fallback: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return position;
}

const formatCoordinates = ({ latitude, longitude }: LatLng) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

/**
 * First step of a tow request: the customer positions the pin on where the
 * vehicle is and confirms. `onConfirm` receives the {@link Place}.
 */
export function PickupStep({ onConfirm }: { onConfirm: (pickup: Place) => void }) {
  const theme = useTheme();
  const start = useStartPosition();
  // The coordinate under the pin; null until the map has settled for the first time.
  const [picked, setPicked] = useState<LatLng | null>(null);
  const startCenter = start.status === 'ready' ? start.center : null;
  const pin = picked ?? startCenter;
  const reverse = useReverseGeocode(pin);

  if (start.status === 'locating') {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
        <Text style={[styles.note, { color: theme.textMuted }]}>{t.locating}</Text>
      </View>
    );
  }

  const insideTunisia = pin !== null && isInTunisia(pin);
  const geocoded = reverse.data;
  const settled = !env.mapboxAccessToken || !reverse.isFetching;
  const address = geocoded?.address ?? (pin ? formatCoordinates(pin) : '');

  return (
    <View style={styles.fill}>
      {env.mapboxAccessToken ? (
        <>
          <TunisMap
            accessToken={env.mapboxAccessToken}
            center={start.center}
            onCenterChange={setPicked}
          />
          <CenterPin />
        </>
      ) : (
        <MissingTokenView />
      )}
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        {start.fallback ? (
          <Text style={[styles.note, { color: theme.warning }]}>
            {start.fallback === 'denied' ? t.locationDenied : t.locationUnavailable}
          </Text>
        ) : null}
        <Text style={[styles.label, { color: theme.textMuted }]}>{t.pickupLabel}</Text>
        {!settled ? (
          <Text style={[styles.address, { color: theme.textMuted }]}>{t.findingAddress}</Text>
        ) : (
          <Text style={[styles.address, { color: theme.text }]}>{address}</Text>
        )}
        {settled && !geocoded && env.mapboxAccessToken && insideTunisia ? (
          <Text style={[styles.note, { color: theme.textMuted }]}>{t.addressUnavailable}</Text>
        ) : null}
        {pin && !insideTunisia ? (
          <Text style={[styles.note, { color: theme.danger }]}>{t.outsideTunisia}</Text>
        ) : null}
        <Button
          title={t.confirmPickup}
          disabled={!pin || !insideTunisia || !settled}
          onPress={() => pin && onConfirm({ ...pin, address })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  label: { fontSize: 13 },
  address: { fontSize: 17, fontWeight: '600' },
  note: { fontSize: 14 },
});
