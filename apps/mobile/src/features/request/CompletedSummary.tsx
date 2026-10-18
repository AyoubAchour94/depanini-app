import type { TowRequest } from '@depanini/shared';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { requestStrings as t } from './strings';
import { Timeline } from './TripProgress';

/**
 * What the customer sees once the driver has dropped the vehicle off: the
 * route, the fare agreed, when each step happened and who towed. The active
 * endpoint no longer carries the driver once the trip is over, so the name is
 * the one seen while it was assigned.
 */
export function CompletedSummary({
  request,
  driverName,
  onDone,
}: {
  request: TowRequest;
  driverName?: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.text }]}>{t.completedTitle}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Field label={t.pickupLabel} value={request.pickup.address} />
        <Field label={t.dropoffPointLabel} value={request.dropoff.address} />
        {driverName ? <Field label={t.driverLabel} value={driverName} /> : null}
        <View>
          <Text style={[styles.label, { color: theme.textMuted }]}>{t.completedFare}</Text>
          <Text style={[styles.fare, { color: theme.text }]}>
            {t.fareAmount(request.agreedFare ?? request.proposedFare)}
          </Text>
        </View>
      </View>
      <Timeline request={request} withCompleted />
      <Button title={t.done} onPress={onDone} />
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={{ color: theme.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  label: { fontSize: 13 },
  fare: { fontSize: 22, fontWeight: '700' },
});
