import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

const HEAD = 26;
const STEM = 14;

/**
 * The fixed pin drawn over the middle of the map: the map moves under it, so
 * the coordinate it points at is the map center. The tip of the stem (not the
 * middle of the pin) marks the spot, hence the padding.
 */
export function CenterPin() {
  const theme = useTheme();
  return (
    <View style={styles.anchor} pointerEvents="none" testID="center-pin">
      <View style={[styles.head, { backgroundColor: theme.brand, borderColor: theme.onBrand }]} />
      <View style={[styles.stem, { backgroundColor: theme.brand }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: HEAD + STEM,
  },
  head: { width: HEAD, height: HEAD, borderRadius: HEAD / 2, borderWidth: 4 },
  stem: { width: 4, height: STEM },
});
