import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { useRealtimeStatus } from './status';

/** A small "Live" / "Reconnecting…" badge; the texts come from the feature's strings module. */
export function LiveIndicator({ live, reconnecting }: { live: string; reconnecting: string }) {
  const theme = useTheme();
  const isLive = useRealtimeStatus() === 'live';
  return (
    <View
      accessible
      accessibilityLabel={isLive ? live : reconnecting}
      style={styles.row}
      testID="live-indicator"
    >
      <View style={[styles.dot, { backgroundColor: isLive ? theme.success : theme.warning }]} />
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{isLive ? live : reconnecting}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
