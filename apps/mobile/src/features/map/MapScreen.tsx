import { StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { ApiHealthBadge } from '@/features/status/ApiHealthBadge';
import { FirebaseBanner } from '@/features/status/FirebaseBanner';
import { useTheme } from '@/theme/theme';

import { TunisMap } from './TunisMap';

/**
 * PLACEHOLDER home screen for Phase 1, shared by both variants. Proves the
 * toolchain end to end: Mapbox renders, the app reaches the API, and Firebase
 * is initialized. Replaced by the real user/driver home screens later.
 */
export function MapScreen() {
  return (
    <View style={styles.fill}>
      {env.mapboxAccessToken ? (
        <TunisMap accessToken={env.mapboxAccessToken} />
      ) : (
        <MissingTokenView />
      )}
      <View style={styles.overlay} pointerEvents="box-none">
        <ApiHealthBadge />
        <FirebaseBanner />
      </View>
    </View>
  );
}

/** Explains a blank map instead of silently rendering nothing. */
function MissingTokenView() {
  const theme = useTheme();
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Mapbox token missing</Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>
        Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in apps/mobile/.env
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 14, textAlign: 'center' },
  overlay: { position: 'absolute', top: 12, left: 12, right: 12, gap: 8, alignItems: 'flex-start' },
});
