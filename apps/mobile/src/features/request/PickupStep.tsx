import { isInTunisia, type LatLng, type Place, TUNIS_CENTER } from '@depanini/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { env } from '@/config/env';
import { BackButton } from '@/features/map/controls';
import { MapScreen } from '@/features/map/MapScreen';
import { useReverseGeocode } from '@/features/places/hooks';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

import { PlaceReadout } from './PlaceReadout';
import { requestStrings as t } from './strings';

/** Snap points of the pickup sheet: the address, a location notice and the pinned action fit at the first. */
const PICKUP_SNAPS = [260] as const;

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

interface PickupStepProps {
  onConfirm: (pickup: Place) => void;
  /** Leaves the flow; the back button shows only when given. */
  onBack?: () => void;
}

/**
 * First step of a tow request: the customer positions the pin on where the
 * vehicle is and confirms. `onConfirm` receives the {@link Place}.
 */
export function PickupStep({ onConfirm, onBack }: PickupStepProps) {
  const theme = useTheme();
  const start = useStartPosition();
  // The coordinate under the pin; null until the map has settled for the first time.
  const [picked, setPicked] = useState<LatLng | null>(null);
  const startCenter = start.status === 'ready' ? start.center : null;
  const pin = picked ?? startCenter;
  const reverse = useReverseGeocode(pin);

  if (start.status === 'locating') {
    return (
      <View style={[styles.locating, { backgroundColor: theme.color.background }]}>
        <ActivityIndicator color={theme.color.brandAccent} />
        <Text tone="muted">{t.locating}</Text>
      </View>
    );
  }

  const insideTunisia = pin !== null && isInTunisia(pin);
  const geocoded = reverse.data;
  const settled = !env.mapboxAccessToken || !reverse.isFetching;
  const address = geocoded?.address ?? (pin ? formatCoordinates(pin) : '');

  return (
    <MapScreen
      center={start.center}
      onCenterChange={setPicked}
      topStart={onBack ? <BackButton onPress={onBack} /> : undefined}
      sheet={{
        snapPoints: PICKUP_SNAPS,
        children: (
          <PlaceReadout label={t.pickupLabel} address={address} finding={!settled}>
            {start.fallback ? (
              <Text variant="caption" tone="warning">
                {start.fallback === 'denied' ? t.locationDenied : t.locationUnavailable}
              </Text>
            ) : null}
            {settled && !geocoded && env.mapboxAccessToken && insideTunisia ? (
              <Text variant="caption" tone="muted">
                {t.addressUnavailable}
              </Text>
            ) : null}
            {pin && !insideTunisia ? (
              <Text variant="caption" tone="danger">
                {t.outsideTunisia}
              </Text>
            ) : null}
          </PlaceReadout>
        ),
        footer: (
          <Button
            size="big"
            title={t.confirmPickup}
            disabled={!pin || !insideTunisia || !settled}
            onPress={() => pin && onConfirm({ ...pin, address })}
          />
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  locating: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
});
