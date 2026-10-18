import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { ApiHealthBadge } from '@/features/status/ApiHealthBadge';
import { FirebaseBanner } from '@/features/status/FirebaseBanner';
import { useTheme } from '@/theme/theme';

import { CenterPin } from './CenterPin';
import { TunisMap } from './TunisMap';

/**
 * Home screen map, shared by both variants. Also proves the toolchain end to
 * end: Mapbox renders, the app reaches the API, and Firebase is initialized.
 * `children` are drawn over the map (the customer home puts its action there).
 */
export function MapScreen({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.fill}>
      {env.mapboxAccessToken ? (
        <>
          <TunisMap accessToken={env.mapboxAccessToken} />
          <CenterPin />
        </>
      ) : (
        <MissingTokenView />
      )}
      <View style={styles.overlay} pointerEvents="box-none">
        <ApiHealthBadge />
        <FirebaseBanner />
      </View>
      {children}
    </View>
  );
}

/** Explains a blank map instead of silently rendering nothing. */
export function MissingTokenView() {
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
