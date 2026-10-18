import type { TowRequest } from '@depanini/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';

import { requestStrings as t } from './strings';
import { truckTypeLabel } from './truck';

/** Who is coming, how to reach them (no phone or plate once completed) and the fare agreed. */
export function AssignedDriver({ request }: { request: TowRequest }) {
  const theme = useTheme();
  const { driver, agreedFare } = request;
  if (!driver) return null;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Row label={t.driverLabel} value={driver.fullName} />
      {driver.phone ? (
        <>
          <Row label={t.phoneLabel} value={driver.phone} />
          <Button
            kind="link"
            title={`${t.callDriver} ${driver.phone}`}
            onPress={() => void Linking.openURL(`tel:${driver.phone}`)}
          />
        </>
      ) : null}
      <Row
        label={t.truckLabel}
        value={[truckTypeLabel(driver.truckType), driver.plateNumber].filter(Boolean).join(' · ')}
      />
      {agreedFare ? (
        <View>
          <Text style={[styles.label, { color: theme.textMuted }]}>{t.agreedFareLabel}</Text>
          <Text style={[styles.fare, { color: theme.text }]}>{t.fareAmount(agreedFare)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={{ color: theme.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 10 },
  label: { fontSize: 13 },
  fare: { fontSize: 20, fontWeight: '700' },
});
