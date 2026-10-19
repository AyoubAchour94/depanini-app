import { useIsFocused } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useEarnings } from '@/api/driver';
import { formatTnd } from '@/features/trip/money';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { driverStrings as t } from './strings';

const PERIODS = ['today', 'week', 'month'] as const;

/** Trips and TND earned today, this week and this month. Read again whenever the screen is focused. */
export function EarningsScreen() {
  const theme = useTheme();
  const focused = useIsFocused();
  const earnings = useEarnings({ enabled: focused });

  if (!earnings.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {earnings.isError ? (
          <>
            <Text style={[styles.message, { color: theme.danger }]}>{t.earningsFailed}</Text>
            <Button title={t.retry} onPress={() => void earnings.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={theme.brand} />
        )}
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.body}>
      {PERIODS.map((period) => (
        <View key={period} style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.textMuted }}>{t.earningsPeriods[period]}</Text>
          <Text style={[styles.total, { color: theme.text }]}>
            {formatTnd(earnings.data[period].totalTnd)}
          </Text>
          <Text style={{ color: theme.text }}>{t.trips(earnings.data[period].trips)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 15, textAlign: 'center' },
  body: { padding: 16, gap: 12 },
  card: { borderRadius: 12, padding: 16, gap: 4 },
  total: { fontSize: 28, fontWeight: '700' },
});
