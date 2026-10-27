import { formatCoordinates } from '@/i18n/format';
import { isInTunisia, type LatLng, TUNIS_CENTER } from '@depanini/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { CenterPin } from '@/features/map/CenterPin';
import { MissingTokenView } from '@/features/map/MapScreen';
import { TunisMap } from '@/features/map/TunisMap';
import { useReverseGeocode } from '@/features/places/hooks';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { useDriverStrings } from './strings';
import { getTestLocation, isTestLocationEnabled, setTestLocation } from './testLocation';

/** Dev/test builds: the driver positions the pin to set where the app thinks they are. */
export function TestLocationScreen() {
  // The route is also guarded in the root layout; this keeps the screen inert on its own.
  if (!isTestLocationEnabled()) return <Redirect href="/" />;
  return <TestLocationPicker />;
}

function TestLocationPicker() {
  const t = useDriverStrings();
  const theme = useTheme();
  const [start] = useState<LatLng>(() => getTestLocation() ?? TUNIS_CENTER);
  const [picked, setPicked] = useState<LatLng | null>(null);
  const pin = picked ?? start;
  const reverse = useReverseGeocode(pin);

  const insideTunisia = isInTunisia(pin);
  const settled = !env.mapboxAccessToken || !reverse.isFetching;
  const address = reverse.data?.address ?? formatCoordinates(pin);

  return (
    <View style={styles.fill}>
      {env.mapboxAccessToken ? (
        <>
          <TunisMap accessToken={env.mapboxAccessToken} center={start} onCenterChange={setPicked} />
          <CenterPin />
        </>
      ) : (
        <MissingTokenView />
      )}
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{t.testLocationTitle}</Text>
        <Text style={[styles.address, { color: settled ? theme.text : theme.textMuted }]}>
          {settled ? address : t.findingAddress}
        </Text>
        {!insideTunisia ? (
          <Text style={[styles.note, { color: theme.danger }]}>{t.outsideTunisia}</Text>
        ) : null}
        <Button
          title={t.confirmTestLocation}
          disabled={!insideTunisia || !settled}
          onPress={() => {
            setTestLocation({ ...pin, address });
            router.back();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
