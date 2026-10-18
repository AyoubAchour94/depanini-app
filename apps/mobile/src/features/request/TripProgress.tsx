import type { TowRequest, TripStage } from '@depanini/shared';
import { StyleSheet, Text, View } from 'react-native';

import { env } from '@/config/env';
import { MissingTokenView } from '@/features/map/MapScreen';
import { TunisMap } from '@/features/map/TunisMap';
import { useTheme } from '@/theme/theme';

import { requestStrings as t } from './strings';

type Times = Pick<
  TowRequest,
  'assignedAt' | 'enRouteAt' | 'arrivedAt' | 'towingAt' | 'completedAt'
>;

/** The map of an assigned trip: the pickup, then the drop-off once towing, and the truck when its position is known. */
export function TripMap({ request }: { request: TowRequest }) {
  const { pickup, dropoff, driverLocation } = request;
  const towing = request.tripStage === 'towing';
  const markers = [
    towing
      ? { id: 'dropoff', kind: 'dropoff' as const, coordinate: dropoff }
      : { id: 'pickup', kind: 'pickup' as const, coordinate: pickup },
    ...(driverLocation
      ? [{ id: 'truck', kind: 'truck' as const, coordinate: driverLocation }]
      : []),
  ];
  return (
    <View style={styles.map}>
      {env.mapboxAccessToken ? (
        <TunisMap
          accessToken={env.mapboxAccessToken}
          center={pickup}
          markers={markers}
          fitToMarkers
        />
      ) : (
        <MissingTokenView />
      )}
    </View>
  );
}

/** Where the trip is, and how long until the truck gets to the next place. */
export function TripStatus({ request }: { request: TowRequest }) {
  const theme = useTheme();
  const stage: TripStage = request.tripStage ?? 'accepted';
  const { etaMin } = request;
  return (
    <View style={styles.status}>
      <Text style={[styles.headline, { color: theme.text }]}>{t.stageHeadline[stage]}</Text>
      {etaMin && stage !== 'arrived' ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>
          {stage === 'towing' ? t.etaToDropoff(etaMin) : t.etaToPickup(etaMin)}
        </Text>
      ) : null}
    </View>
  );
}

/** The stages reached so far, with the time of each. */
export function Timeline({
  request,
  withCompleted = false,
}: {
  request: Times;
  withCompleted?: boolean;
}) {
  const theme = useTheme();
  const steps = [
    [t.timeline.accepted, request.assignedAt],
    [t.timeline.enRoute, request.enRouteAt],
    [t.timeline.arrived, request.arrivedAt],
    [t.timeline.towing, request.towingAt],
    ...(withCompleted ? [[t.timeline.completed, request.completedAt] as const] : []),
  ] as const;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{t.timelineTitle}</Text>
      {steps.map(([label, at]) => (
        <View key={label} style={styles.row}>
          <Text style={{ color: at ? theme.text : theme.textMuted }}>{label}</Text>
          <Text style={{ color: theme.textMuted }}>{at ? t.time(at) : '–'}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 240, borderRadius: 12, overflow: 'hidden' },
  status: { gap: 4 },
  headline: { fontSize: 20, fontWeight: '600' },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  label: { fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
