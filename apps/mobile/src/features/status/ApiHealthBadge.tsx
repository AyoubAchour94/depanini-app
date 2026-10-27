import { StyleSheet, Text, View } from 'react-native';

import { useApiHealth } from '@/api/health';
import { env } from '@/config/env';
import { useTranslation } from '@/i18n';
import { type Theme, useTheme } from '@/theme/theme';

type Status = 'unconfigured' | 'checking' | 'ok' | 'degraded' | 'unreachable';

function dotColor(status: Status, theme: Theme) {
  if (status === 'ok') return theme.success;
  if (status === 'degraded') return theme.warning;
  if (status === 'unreachable') return theme.danger;
  return theme.textMuted;
}

/** Small pill showing whether the app can reach `GET /health`. */
export function ApiHealthBadge() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data, isError } = useApiHealth();
  const status: Status = !env.apiUrl
    ? 'unconfigured'
    : isError
      ? 'unreachable'
      : (data?.status ?? 'checking');

  return (
    <View style={[styles.pill, { backgroundColor: theme.surface }]} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: dotColor(status, theme) }]} />
      <Text style={{ color: theme.text }}>{t(`status:api.${status}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
