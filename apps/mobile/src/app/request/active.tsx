import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { requestStrings as t } from '@/features/request/strings';
import { useTheme } from '@/theme/theme';

/** Placeholder until the active request screen (#25) replaces it. */
export default function ActiveRequestRoute() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>{t.requestSent}</Text>
      {id ? <Text style={{ color: theme.textMuted }}>{id}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 20, fontWeight: '600' },
});
