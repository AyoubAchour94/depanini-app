import { useIsFocused } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { useEarnings } from '@/api/driver';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Num } from '@/ui/Num';
import { Text } from '@/ui/Text';

import { useDriverStrings } from './strings';

const PERIODS = ['today', 'week', 'month'] as const;

/** Trips and TND earned today, this week and this month. Read again whenever the screen is focused. */
export function EarningsScreen() {
  const t = useDriverStrings();
  const theme = useTheme();
  const focused = useIsFocused();
  const earnings = useEarnings({ enabled: focused });

  if (!earnings.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        {earnings.isError ? (
          <>
            <Text tone="danger" style={styles.message}>
              {t.earningsFailed}
            </Text>
            <Button title={t.retry} onPress={() => void earnings.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={theme.color.brandAccent} />
        )}
      </View>
    );
  }

  const data = earnings.data;
  return (
    <ScrollView
      style={{ backgroundColor: theme.color.background }}
      contentContainerStyle={styles.body}
    >
      {PERIODS.map((period) => {
        const hero = period === 'today';
        return (
          <View
            key={period}
            style={[
              styles.card,
              {
                backgroundColor: hero ? theme.color.brandTint : theme.color.surface,
                borderWidth: hero ? 1 : 0,
                borderColor: theme.color.brandAccent,
                borderRadius: theme.radius.xl,
                padding: hero ? theme.space[6] : theme.space[5],
              },
            ]}
          >
            <Text variant="label" tone={hero ? 'brand' : 'muted'}>
              {t.earningsPeriods[period]}
            </Text>
            <Num size={hero ? 'display' : 'figure'} value={data[period].totalTnd} unit="TND" />
            <Text tone="muted">{t.trips(data[period].trips)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { textAlign: 'center' },
  body: { padding: 16, gap: 12 },
  card: { gap: 4 },
});
