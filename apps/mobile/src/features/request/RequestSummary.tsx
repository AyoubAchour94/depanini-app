import type { TowRequest, TowRequestStatus } from '@depanini/shared';
import { StyleSheet, Text, View } from 'react-native';

import { type Theme, useTheme } from '@/theme/theme';

import { requestStrings as t } from './strings';

/** Where the request is, where it goes, what for and the fare offered. */
export function RequestSummary({ request }: { request: TowRequest }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <PlaceRow label={t.pickupLabel} address={request.pickup.address} />
      <PlaceRow label={t.dropoffPointLabel} address={request.dropoff.address} />
      <Text style={{ color: theme.text }}>
        {t.vehicleOptions[request.vehicleType]} · {t.problemOptions[request.problemType]}
      </Text>
      {request.note ? <Text style={{ color: theme.textMuted }}>{request.note}</Text> : null}
      <Text style={[styles.fare, { color: theme.text }]}>{t.fareAmount(request.proposedFare)}</Text>
    </View>
  );
}

function PlaceRow({ label, address }: { label: string; address: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={{ color: theme.text }}>{address}</Text>
    </View>
  );
}

const badgeColor = (status: TowRequestStatus, theme: Theme) =>
  status === 'open' || status === 'assigned' || status === 'completed'
    ? theme.success
    : status === 'expired'
      ? theme.warning
      : theme.textMuted;

/** The state of a request as a small coloured label. */
export function StatusBadge({ status }: { status: TowRequestStatus }) {
  const theme = useTheme();
  const color = badgeColor(status, theme);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{t.statusLabels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 10 },
  label: { fontSize: 13 },
  fare: { fontSize: 20, fontWeight: '700' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
