import type { TowRequest, TripStage } from '@depanini/shared';
import { StyleSheet, View } from 'react-native';

import type { MapMarker } from '@/features/map/map-props';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/Card';
import { Num } from '@/ui/Num';
import { StageBar } from '@/ui/StageBar';
import { Text } from '@/ui/Text';

import { requestStrings as t } from './strings';

type Times = Pick<
  TowRequest,
  'assignedAt' | 'enRouteAt' | 'arrivedAt' | 'towingAt' | 'completedAt'
>;

/** The markers of an assigned trip: the pickup, then the drop-off once towing, and the truck when its position is known. */
export function tripMarkers(request: TowRequest): MapMarker[] {
  const { pickup, dropoff, driverLocation } = request;
  const towing = request.tripStage === 'towing';
  return [
    towing
      ? { id: 'dropoff', kind: 'dropoff', coordinate: dropoff }
      : { id: 'pickup', kind: 'pickup', coordinate: pickup },
    ...(driverLocation
      ? [{ id: 'truck', kind: 'truck' as const, coordinate: driverLocation }]
      : []),
  ];
}

const STAGE_ORDER: readonly TripStage[] = ['accepted', 'en_route', 'arrived', 'towing'];
/** How far through its stage the trip is: waiting stages are done, driving stages half way. */
const STAGE_PROGRESS: Record<TripStage, number> = {
  accepted: 1,
  en_route: 0.5,
  arrived: 1,
  towing: 0.5,
};

/** Where the trip is, how long until the truck gets to the next place, and the four stages. */
export function TripStatus({ request }: { request: TowRequest }) {
  const stage: TripStage = request.tripStage ?? 'accepted';
  const { etaMin } = request;
  const showEta = Boolean(etaMin) && stage !== 'arrived';
  return (
    <View style={styles.status}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="title">{t.stageHeadline[stage]}</Text>
          {showEta ? (
            <Text accessibilityLiveRegion="polite" tone="muted">
              {stage === 'towing' ? t.etaToDropoff(etaMin!) : t.etaToPickup(etaMin!)}
            </Text>
          ) : null}
        </View>
        {showEta ? <Num size="figure" value={etaMin!} unit="min" /> : null}
      </View>
      <StageBar
        stages={[t.timeline.accepted, t.timeline.enRoute, t.timeline.arrived, t.timeline.towing]}
        current={STAGE_ORDER.indexOf(stage)}
        progress={STAGE_PROGRESS[stage]}
        captions={[request.assignedAt, request.enRouteAt, request.arrivedAt, request.towingAt].map(
          (at) => (at ? t.time(at) : '–'),
        )}
      />
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
    <Card style={{ gap: theme.space[2] }}>
      <Text variant="heading">{t.timelineTitle}</Text>
      {steps.map(([label, at]) => (
        <View key={label} style={styles.row}>
          <Text tone={at ? 'text' : 'muted'}>{label}</Text>
          <Text tone="muted" style={styles.time}>
            {at ? t.time(at) : '–'}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  status: { gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontVariant: ['tabular-nums'] },
});
