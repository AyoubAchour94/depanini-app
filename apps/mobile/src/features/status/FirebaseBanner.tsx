import { StyleSheet, Text, View } from 'react-native';

import { getFirebaseStatus } from '@/firebase/firebase';
import { useTheme } from '@/theme/theme';

/** Debug-only notice when Firebase is not configured; renders nothing otherwise. */
export function FirebaseBanner() {
  const theme = useTheme();
  if (!__DEV__ || getFirebaseStatus().configured) return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.warning }]}>
      <Text style={styles.text}>Firebase not configured</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  text: { color: '#101828', fontWeight: '600' },
});
